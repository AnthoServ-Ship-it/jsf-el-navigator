import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { type BeanIndex, type IndexedBean } from "./beanIndex";
import { type ElAnalysisCache } from "./elAnalysisCache";
import { findJavaMembers, parseJavaBean } from "./javaParser";
import { writeLog } from "./logging";
import { findProjectRoot } from "./moduleResolver";
import { type ResourceBundleResolver } from "./resourceBundleResolver";
import { type SourceSpan } from "./types";

/** Implementa F12 y Ctrl+clic desde un archivo XHTML hacia el código Java. */
export class JsfElDefinitionProvider implements vscode.DefinitionProvider {
    private readonly typeCache = new Map<string, Promise<IndexedBean[]>>();

    public constructor(
        private readonly index: BeanIndex,
        private readonly output: vscode.OutputChannel,
        private readonly analysis: ElAnalysisCache,
        private readonly resourceBundles: ResourceBundleResolver
    ) {}

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        return this.resolve(document, position, token);
    }

    /**
     * Resuelve una referencia tanto para el proveedor estándar como para el
     * comando directo. El comando evita interferencias de otras extensiones.
     */
    public async resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".xhtml")) {
            return undefined;
        }

        const target = this.analysis.findTargetAt(document, document.offsetAt(position));
        if (!target) {
            return undefined;
        }

        const bundleResolution = await this.resourceBundles.resolve(document, target, token);
        if (bundleResolution) {
            return bundleResolution.links.length > 0 ? bundleResolution.links : undefined;
        }

        writeLog(
            this.output,
            "debug",
            `Resolviendo ${target.segments.map((item) => item.name).join(".")} desde ${document.fileName}:${position.line + 1}.`,
            document.uri
        );

        const variable = this.analysis.findVariableAt(
            document,
            target.expressionStart,
            target.beanName
        );
        const beans = variable
            ? await this.resolveVariableTypes(document, variable.binding.segments, token)
            : await this.index.findBeans(document.uri, target.beanName, token);
        if (token.isCancellationRequested) {
            return undefined;
        }

        if (beans.length === 0) {
            writeLog(
                this.output,
                "debug",
                variable
                    ? `No se pudo inferir el tipo de la variable XHTML ${target.beanName}.`
                    : `Bean no encontrado en el módulo actual: ${target.beanName}`,
                document.uri
            );
            return undefined;
        }

        const selected = target.segments[target.selectedIndex];
        const originSelectionRange = new vscode.Range(
            document.positionAt(selected.start),
            document.positionAt(selected.end)
        );

        if (target.selectedIndex === 0) {
            return this.linksForBeans(beans, originSelectionRange);
        }

        // La primera versión resuelve miembros directos del bean. Los segmentos
        // anidados se incorporarán cuando exista resolución completa de tipos.
        if (target.selectedIndex > 1) {
            return this.resolveNestedMember(
                document,
                target.segments,
                target.selectedIndex,
                beans,
                originSelectionRange,
                token
            );
        }

        const links: vscode.LocationLink[] = [];
        for (const bean of beans) {
            const members = findJavaMembers(bean, selected.name, selected.invoked);
            for (const member of members) {
                links.push(await this.createLink(bean, member.span, originSelectionRange));
            }
        }

        if (links.length === 0) {
            writeLog(
                this.output,
                "debug",
                `El bean ${target.beanName} fue encontrado, pero no contiene el miembro público ${selected.name}.`,
                document.uri
            );
        }

        return links.length > 0 ? links : undefined;
    }

    private async resolveVariableTypes(
        document: vscode.TextDocument,
        bindingSegments: Array<{ name: string; invoked: boolean }>,
        token: vscode.CancellationToken
    ): Promise<IndexedBean[]> {
        let currentTypes = await this.index.findBeans(document.uri, bindingSegments[0].name, token);
        let returnTypes: string[] = [];

        for (let index = 1; index < bindingSegments.length; index += 1) {
            const segment = bindingSegments[index];
            const members = currentTypes.flatMap((type) =>
                findJavaMembers(type, segment.name, segment.invoked)
            );
            returnTypes = members
                .map((member) => member.returnType)
                .filter((type): type is string => Boolean(type));

            if (index < bindingSegments.length - 1) {
                currentTypes = [];
                for (const typeName of new Set(returnTypes.map(simpleTypeName).filter(Boolean))) {
                    currentTypes.push(...(await this.findTypes(document.uri, typeName as string)));
                }
            }
            if (token.isCancellationRequested || returnTypes.length === 0) return [];
        }

        const elementNames = new Set(
            returnTypes
                .map(iterationElementTypeName)
                .filter((name): name is string => Boolean(name))
        );
        const elementTypes: IndexedBean[] = [];
        for (const typeName of elementNames) {
            elementTypes.push(...(await this.findTypes(document.uri, typeName)));
        }
        return token.isCancellationRequested ? [] : elementTypes;
    }

    private async resolveNestedMember(
        document: vscode.TextDocument,
        segments: Array<{ name: string; invoked: boolean }>,
        selectedIndex: number,
        initialTypes: IndexedBean[],
        originSelectionRange: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        let currentTypes = initialTypes;

        for (let segmentIndex = 1; segmentIndex <= selectedIndex; segmentIndex += 1) {
            const segment = segments[segmentIndex];
            const members = currentTypes.flatMap((type) =>
                findJavaMembers(type, segment.name, segment.invoked).map((member) => ({
                    type,
                    member
                }))
            );

            if (segmentIndex === selectedIndex) {
                const links = await Promise.all(
                    members.map((item) =>
                        this.createLink(item.type, item.member.span, originSelectionRange)
                    )
                );
                if (links.length === 0) {
                    writeLog(
                        this.output,
                        "debug",
                        `No se pudo resolver el segmento EL anidado ${segment.name}.`,
                        document.uri
                    );
                }
                return links.length > 0 ? links : undefined;
            }

            const typeNames = new Set(
                members
                    .map((item) => simpleTypeName(item.member.returnType))
                    .filter(Boolean) as string[]
            );
            currentTypes = [];
            for (const typeName of typeNames) {
                currentTypes.push(...(await this.findTypes(document.uri, typeName)));
            }

            if (token.isCancellationRequested || currentTypes.length === 0) {
                return undefined;
            }
        }

        return undefined;
    }

    private async findTypes(documentUri: vscode.Uri, typeName: string): Promise<IndexedBean[]> {
        const projectRoot = await findProjectRoot(documentUri);
        const key = `${projectRoot.fsPath}:${typeName}`;
        const cached = this.typeCache.get(key);
        if (cached) {
            return cached;
        }

        const build = (async () => {
            let files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(projectRoot, `**/src/main/java/**/${typeName}.java`),
                "**/{target,build,node_modules,.git}/**"
            );
            if (files.length === 0) {
                files = await vscode.workspace.findFiles(
                    `**/src/main/java/**/${typeName}.java`,
                    "**/{target,build,node_modules,.git}/**"
                );
            }
            const types: IndexedBean[] = [];
            for (const uri of files) {
                const source =
                    uri.scheme === "file"
                        ? await readFile(uri.fsPath, "utf8")
                        : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
                const parsed = parseJavaBean(source, true);
                if (parsed) {
                    types.push({ ...parsed, uri });
                }
            }
            return types;
        })();
        this.typeCache.set(key, build);
        return build;
    }

    private async linksForBeans(
        beans: IndexedBean[],
        originSelectionRange: vscode.Range
    ): Promise<vscode.LocationLink[]> {
        return Promise.all(
            beans.map((bean) => this.createLink(bean, bean.classSpan, originSelectionRange))
        );
    }

    private async createLink(
        bean: IndexedBean,
        span: SourceSpan,
        originSelectionRange: vscode.Range
    ): Promise<vscode.LocationLink> {
        const targetDocument = await vscode.workspace.openTextDocument(bean.uri);
        const targetSelectionRange = new vscode.Range(
            targetDocument.positionAt(span.start),
            targetDocument.positionAt(span.end)
        );

        return {
            originSelectionRange,
            targetUri: bean.uri,
            targetRange: targetSelectionRange,
            targetSelectionRange
        };
    }
}

function simpleTypeName(returnType: string | undefined): string | undefined {
    if (!returnType || returnType === "void") {
        return undefined;
    }
    const generic = /<\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*>/.exec(returnType)?.[1];
    const raw =
        generic ??
        returnType
            .replace(/<.*>/, "")
            .replace(/\[\s*\]/g, "")
            .trim();
    return raw.slice(raw.lastIndexOf(".") + 1);
}

function iterationElementTypeName(returnType: string): string | undefined {
    const array = /([A-Za-z_$][A-Za-z0-9_$.]*)\s*\[\s*\]\s*$/.exec(returnType)?.[1];
    if (array) return array.slice(array.lastIndexOf(".") + 1);

    const open = returnType.indexOf("<");
    const close = returnType.lastIndexOf(">");
    if (open < 0 || close <= open) return undefined;

    const firstArgument = returnType
        .slice(open + 1, close)
        .split(",", 1)[0]
        .replace(/^\s*\?\s*(?:extends|super)\s+/, "")
        .trim();
    const nestedRaw = firstArgument.replace(/<.*>/, "").trim();
    return nestedRaw.slice(nestedRaw.lastIndexOf(".") + 1) || undefined;
}
