import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { findJavaServiceTargetAt, type JavaServiceTarget } from "./javaServiceParser";
import { parseJavaBean } from "./javaParser";
import { findProjectRoot } from "./moduleResolver";
import { type SourceSpan } from "./types";

/** Navega desde una llamada de un controlador hacia el servicio EJB inyectado. */
export class JavaServiceDefinitionProvider implements vscode.DefinitionProvider {
    public constructor(private readonly output: vscode.OutputChannel) {}

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

        const target = findJavaServiceTargetAt(document.getText(), document.offsetAt(position));
        if (!target) {
            return undefined;
        }

        const projectRoot = await findProjectRoot(document.uri);
        this.output.appendLine(
            `[INFO] Resolviendo servicio ${target.service.fieldName}.${target.methodName} en ${projectRoot.fsPath}.`
        );

        const files = await this.findServiceFiles(projectRoot, target);
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

            if (links.length === 0 && parsed?.superClassName) {
                files.push(...(await this.findClassFiles(projectRoot, parsed.superClassName)));
            }

            // El lookup EJB identifica la implementación concreta. Si el método
            // se encontró allí, no mezclamos la declaración de la interfaz.
            if (links.length > 0) {
                break;
            }
        }

        if (links.length === 0) {
            this.output.appendLine(
                `[INFO] No se encontró ${target.methodName} en el servicio ${target.service.typeName}.`
            );
        }
        return links.length > 0 ? links : undefined;
    }

    private async findServiceFiles(
        projectRoot: vscode.Uri,
        target: JavaServiceTarget
    ): Promise<vscode.Uri[]> {
        const names = new Set<string>();
        if (target.service.implementationClass) {
            names.add(target.service.implementationClass);
        }
        names.add(`${target.service.typeName}Impl`);
        names.add(target.service.typeName);

        const files: vscode.Uri[] = [];
        for (const className of names) {
            const found = await vscode.workspace.findFiles(
                new vscode.RelativePattern(projectRoot, `**/src/main/java/**/${className}.java`),
                "**/{target,build,node_modules,.git}/**"
            );
            for (const uri of found) {
                if (!files.some((existing) => existing.toString() === uri.toString())) {
                    files.push(uri);
                }
            }

            // Se prioriza la primera implementación encontrada. La interfaz se
            // usa únicamente como respaldo cuando no existe código fuente.
            if (found.length > 0) {
                return files;
            }
        }
        return files;
    }

    private findClassFiles(projectRoot: vscode.Uri, className: string): Thenable<vscode.Uri[]> {
        const simpleName = className.slice(className.lastIndexOf(".") + 1);
        return vscode.workspace.findFiles(
            new vscode.RelativePattern(projectRoot, `**/src/main/java/**/${simpleName}.java`),
            "**/{target,build,node_modules,.git}/**"
        );
    }
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
