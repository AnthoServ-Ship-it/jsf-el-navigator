import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { type BeanIndex, type IndexedBean } from "./beanIndex";
import { findElTargetAt } from "./elParser";
import { findJavaMembers, parseJavaBean } from "./javaParser";
import { findProjectRoot } from "./moduleResolver";
import { type SourceSpan } from "./types";

/** Implementa F12 y Ctrl+clic desde un archivo XHTML hacia el código Java. */
export class JsfElDefinitionProvider implements vscode.DefinitionProvider {
    private readonly typeCache = new Map<string, Promise<IndexedBean[]>>();

    public constructor(
        private readonly index: BeanIndex,
        private readonly output: vscode.OutputChannel
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

        const target = findElTargetAt(document.getText(), document.offsetAt(position));
        if (!target) {
            this.output.appendLine(
                `[INFO] El cursor no está sobre una referencia EL navegable (${document.fileName}:${position.line + 1}).`
            );
            return undefined;
        }

        this.output.appendLine(
            `[INFO] Resolviendo ${target.segments.map((item) => item.name).join(".")} desde ${document.fileName}:${position.line + 1}.`
        );

        const beans = await this.index.findBeans(document.uri, target.beanName, token);
        if (token.isCancellationRequested) {
            return undefined;
        }

        if (beans.length === 0) {
            this.output.appendLine(
                `[INFO] Bean no encontrado en el módulo actual: ${target.beanName}`
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
            this.output.appendLine(
                `[INFO] El bean ${target.beanName} fue encontrado, pero no contiene el miembro público ${selected.name}.`
            );
        }

        return links.length > 0 ? links : undefined;
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
                    this.output.appendLine(
                        `[INFO] No se pudo resolver el segmento EL anidado ${segment.name}.`
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
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(projectRoot, `**/src/main/java/**/${typeName}.java`),
                "**/{target,build,node_modules,.git}/**"
            );
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
