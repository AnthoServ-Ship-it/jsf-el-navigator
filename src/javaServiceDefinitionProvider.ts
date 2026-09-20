import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { type JavaServiceAnalysisCache } from "./javaServiceAnalysisCache";
import { type JavaServiceTarget } from "./javaServiceParser";
import { writeLog } from "./logging";
import { parseJavaBean } from "./javaParser";
import { findProjectRoot } from "./moduleResolver";
import { type SourceSpan } from "./types";

/** Navega desde una llamada de un controlador hacia el servicio EJB inyectado. */
export class JavaServiceDefinitionProvider implements vscode.DefinitionProvider, vscode.Disposable {
    private readonly classFiles = new Map<string, Promise<vscode.Uri[]>>();
    private readonly implementationFiles = new Map<string, Promise<vscode.Uri[]>>();

    public constructor(
        private readonly output: vscode.OutputChannel,
        private readonly analysis: JavaServiceAnalysisCache
    ) {}

    /** Descarta únicamente resultados de rutas cuando cambia el workspace. */
    public invalidateWorkspaceCache(): void {
        this.classFiles.clear();
        this.implementationFiles.clear();
    }

    public dispose(): void {
        this.invalidateWorkspaceCache();
    }

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        return this.resolve(document, position, token);
    }

    public async resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".java")) {
            return undefined;
        }

        const target = this.analysis.findTargetAt(document, document.offsetAt(position));
        if (!target) {
            return undefined;
        }

        const projectRoot = await findProjectRoot(document.uri);
        writeLog(
            this.output,
            "debug",
            `Resolviendo servicio ${target.service.fieldName}.${target.methodName} en ${projectRoot.fsPath}.`,
            document.uri
        );

        const files = await this.findServiceFiles(projectRoot, target, token);
        if (token.isCancellationRequested) {
            return undefined;
        }

        const originSelectionRange = new vscode.Range(
            document.positionAt(target.methodSpan.start),
            document.positionAt(target.methodSpan.end)
        );
        const links: vscode.LocationLink[] = [];
        const visitedFiles = new Set<string>();

        for (const uri of files) {
            if (visitedFiles.has(uri.toString())) continue;
            visitedFiles.add(uri.toString());
            const source = await readSource(uri);
            const parsed = parseJavaBean(source, true);
            const linksBeforeFile = links.length;
            const matchingMembers = parsed
                ? parsed.members.filter(
                      (member) => member.kind === "method" && member.name === target.methodName
                  )
                : [];
            const sameArity = matchingMembers.filter(
                (member) => member.parameterCount === target.argumentCount
            );
            const bestMatches = selectBestOverloads(sameArity, target.argumentTypes);
            const methodSpans = parsed
                ? (bestMatches.length > 0 ? bestMatches : matchingMembers).map(
                      (member) => member.span
                  )
                : findInterfaceMethodSpans(source, target.methodName, target.argumentCount);

            for (const span of methodSpans) {
                links.push(await createLink(uri, span, originSelectionRange));
            }

            if (links.length === linksBeforeFile && parsed?.superClassName) {
                files.push(...(await this.findClassFiles(projectRoot, parsed.superClassName)));
            }
        }

        if (links.length === 0) {
            writeLog(
                this.output,
                "debug",
                `No se encontró ${target.methodName} en el servicio ${target.service.typeName}.`,
                document.uri
            );
        }
        return links.length > 0 ? links : undefined;
    }

    private async findServiceFiles(
        projectRoot: vscode.Uri,
        target: JavaServiceTarget,
        token: vscode.CancellationToken
    ): Promise<vscode.Uri[]> {
        if (target.service.implementationClass) {
            const explicitImplementation = await this.findClassFiles(
                projectRoot,
                target.service.implementationClass
            );
            if (explicitImplementation.length > 0) {
                return explicitImplementation;
            }
        }

        const conventionalFiles: vscode.Uri[] = [];
        for (const uri of await this.findClassFiles(
            projectRoot,
            `${target.service.typeName}Impl`
        )) {
            addUniqueUri(conventionalFiles, uri);
        }
        if (conventionalFiles.length > 0 && !target.service.qualifier) {
            return conventionalFiles;
        }
        if (target.service.qualifier) {
            const qualifiedConventional: vscode.Uri[] = [];
            for (const uri of conventionalFiles) {
                try {
                    if (declaresQualifier(await readSource(uri), target.service.qualifier)) {
                        qualifiedConventional.push(uri);
                    }
                } catch {
                    // Se continúa con la búsqueda general de implementaciones.
                }
            }
            if (qualifiedConventional.length > 0) {
                return qualifiedConventional;
            }
        }

        const implementations = await this.findImplementations(
            projectRoot,
            target.service.typeName,
            target.service.qualifier,
            token
        );
        if (implementations.length > 0) {
            return implementations;
        }

        // La interfaz es el último respaldo cuando el proyecto no incluye una
        // implementación concreta o esta proviene de una dependencia externa.
        return this.findClassFiles(projectRoot, target.service.typeName);
    }

    private async findClassFiles(
        projectRoot: vscode.Uri,
        className: string
    ): Promise<vscode.Uri[]> {
        const simpleName = className.slice(className.lastIndexOf(".") + 1);
        const key = `${projectRoot.toString()}#${simpleName}`;
        let lookup = this.classFiles.get(key);
        if (!lookup) {
            lookup = (async () => {
                const projectFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(
                        projectRoot,
                        `**/src/main/java/**/${simpleName}.java`
                    ),
                    "**/{target,build,node_modules,.git}/**"
                );
                if (projectFiles.length > 0) return projectFiles;

                // Algunos EJB viven en proyectos hermanos del mismo workspace
                // (por ejemplo entidades-servicios fuera del agregador web).
                return vscode.workspace.findFiles(
                    `**/src/main/java/**/${simpleName}.java`,
                    "**/{target,build,node_modules,.git}/**"
                );
            })();
            this.classFiles.set(key, lookup);
        }
        return lookup;
    }

    private async findImplementations(
        projectRoot: vscode.Uri,
        interfaceName: string,
        qualifier: string | undefined,
        token: vscode.CancellationToken
    ): Promise<vscode.Uri[]> {
        const cacheKey = `${projectRoot.toString()}#${interfaceName}#${qualifier ?? ""}`;
        const cached = this.implementationFiles.get(cacheKey);
        if (cached) return cached;

        const lookup = this.scanImplementations(projectRoot, interfaceName, qualifier, token);
        this.implementationFiles.set(cacheKey, lookup);
        try {
            const result = await lookup;
            if (token.isCancellationRequested) this.implementationFiles.delete(cacheKey);
            return result;
        } catch (error) {
            this.implementationFiles.delete(cacheKey);
            throw error;
        }
    }

    private async scanImplementations(
        projectRoot: vscode.Uri,
        interfaceName: string,
        qualifier: string | undefined,
        token: vscode.CancellationToken
    ): Promise<vscode.Uri[]> {
        const javaFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectRoot, "**/src/main/java/**/*.java"),
            "**/{target,build,node_modules,.git}/**"
        );
        const matches: Array<{ uri: vscode.Uri; source: string }> = [];

        for (let start = 0; start < javaFiles.length; start += 32) {
            if (token.isCancellationRequested) return [];
            const batch = javaFiles.slice(start, start + 32);
            const sources = await Promise.all(
                batch.map(async (uri) => {
                    try {
                        return { uri, source: await readSource(uri) };
                    } catch {
                        return undefined;
                    }
                })
            );

            for (const item of sources) {
                if (!item || token.isCancellationRequested) continue;
                const { uri, source } = item;
                const parsed = parseJavaBean(source, true);
                if (
                    parsed?.interfaceNames.some(
                        (candidate) => simpleClassName(candidate) === interfaceName
                    )
                ) {
                    matches.push({ uri, source });
                }
            }
        }

        if (qualifier) {
            const qualified = matches.filter(({ source }) => declaresQualifier(source, qualifier));
            if (qualified.length > 0) {
                return qualified.map(({ uri }) => uri);
            }
        }
        return matches.map(({ uri }) => uri);
    }
}

function addUniqueUri(files: vscode.Uri[], uri: vscode.Uri): void {
    if (!files.some((existing) => existing.toString() === uri.toString())) {
        files.push(uri);
    }
}

function simpleClassName(value: string): string {
    const withoutGenerics = value.replace(/<.*>/, "").trim();
    return withoutGenerics.slice(withoutGenerics.lastIndexOf(".") + 1);
}

function declaresQualifier(source: string, qualifier: string): boolean {
    const escapedQualifier = qualifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
        `@(?:[A-Za-z_$][A-Za-z0-9_$]*\\.)*(?:Named|Qualifier|Service|Component)\\s*\\(\\s*(?:value\\s*=\\s*)?"${escapedQualifier}"`
    ).test(source);
}

function selectBestOverloads(
    members: NonNullable<ReturnType<typeof parseJavaBean>>["members"],
    argumentTypes: Array<string | undefined>
): NonNullable<ReturnType<typeof parseJavaBean>>["members"] {
    if (members.length <= 1) {
        return members;
    }

    const scored = members.map((member) => ({
        member,
        score: (member.parameterTypes ?? []).reduce(
            (total, parameterType, index) =>
                total + compatibilityScore(argumentTypes[index], parameterType),
            0
        )
    }));
    const maximum = Math.max(...scored.map((item) => item.score));
    return scored.filter((item) => item.score === maximum).map((item) => item.member);
}

function compatibilityScore(argumentType: string | undefined, parameterType: string): number {
    if (!argumentType) return 0;
    const wrappers: Record<string, string> = {
        boolean: "Boolean",
        byte: "Byte",
        char: "Character",
        double: "Double",
        float: "Float",
        int: "Integer",
        long: "Long",
        short: "Short"
    };
    const normalizedArgument = wrappers[argumentType] ?? argumentType;
    const normalizedParameter = wrappers[parameterType] ?? parameterType;
    if (normalizedArgument === normalizedParameter) return 4;
    const numeric = new Set(["Byte", "Short", "Integer", "Long", "Float", "Double"]);
    if (numeric.has(normalizedArgument) && numeric.has(normalizedParameter)) return 1;
    return -3;
}

async function readSource(uri: vscode.Uri): Promise<string> {
    return uri.scheme === "file"
        ? readFile(uri.fsPath, "utf8")
        : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
}

async function createLink(
    uri: vscode.Uri,
    span: SourceSpan,
    originSelectionRange: vscode.Range
): Promise<vscode.LocationLink> {
    const document = await vscode.workspace.openTextDocument(uri);
    const targetSelectionRange = new vscode.Range(
        document.positionAt(span.start),
        document.positionAt(span.end)
    );
    return {
        originSelectionRange,
        targetUri: uri,
        targetRange: targetSelectionRange,
        targetSelectionRange
    };
}

/** Respaldo para declaraciones de métodos dentro de interfaces Java. */
function findInterfaceMethodSpans(
    source: string,
    methodName: string,
    argumentCount: number
): SourceSpan[] {
    const escapedName = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedName}\\s*\\([^;{}]*\\)\\s*;`, "g");
    const spans: SourceSpan[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
        const openParenthesis = match[0].indexOf("(");
        const closeParenthesis = match[0].lastIndexOf(")");
        if (
            countInterfaceParameters(match[0].slice(openParenthesis + 1, closeParenthesis)) !==
            argumentCount
        ) {
            continue;
        }
        const start = match.index + match[0].indexOf(methodName);
        spans.push({ start, end: start + methodName.length });
    }
    return spans;
}

function countInterfaceParameters(parameters: string): number {
    if (parameters.trim().length === 0) {
        return 0;
    }
    let count = 1;
    let genericDepth = 0;
    for (const character of parameters) {
        if (character === "<") {
            genericDepth += 1;
        } else if (character === ">") {
            genericDepth = Math.max(0, genericDepth - 1);
        } else if (character === "," && genericDepth === 0) {
            count += 1;
        }
    }
    return count;
}
