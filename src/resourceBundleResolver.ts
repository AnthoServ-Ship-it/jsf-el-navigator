import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { findNearestModuleRoot } from "./moduleResolver";
import {
    findPropertyKeySpans,
    parseResourceBundleDeclarations,
    type ResourceBundleDeclaration
} from "./resourceBundleParser";
import { type ElTarget, type SourceSpan } from "./types";

interface CachedDeclaration extends ResourceBundleDeclaration {
    uri: vscode.Uri;
}

export interface ResourceBundleResolution {
    links: vscode.LocationLink[];
}

/** Resuelve variables JSF como `lbl.clave` dentro del módulo XHTML actual. */
export class ResourceBundleResolver implements vscode.Disposable {
    private readonly declarations = new Map<string, Promise<CachedDeclaration[]>>();
    private readonly files = new Map<string, Promise<vscode.Uri[]>>();
    private readonly subscriptions: vscode.Disposable[];

    public constructor() {
        this.subscriptions = [
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.invalidate()),
            vscode.workspace.onDidSaveTextDocument((document) => {
                const name = path.basename(document.uri.fsPath).toLowerCase();
                if (name === "faces-config.xml" || name.endsWith(".properties")) {
                    this.invalidate();
                }
            })
        ];
    }

    public async resolve(
        document: vscode.TextDocument,
        target: ElTarget,
        token: vscode.CancellationToken
    ): Promise<ResourceBundleResolution | undefined> {
        const moduleRoot = await findNearestModuleRoot(document.uri);
        const declarations = await this.getDeclarations(moduleRoot);
        const declaration = declarations.find((item) => item.variable === target.beanName);
        if (!declaration || token.isCancellationRequested) return undefined;

        const selected = target.segments[target.selectedIndex];
        const originSelectionRange = rangeFromSpan(document, selected);
        if (target.selectedIndex === 0) {
            return {
                links: [
                    await createLink(
                        declaration.uri,
                        declaration.variableSpan,
                        originSelectionRange
                    )
                ]
            };
        }
        if (target.selectedIndex !== 1) return { links: [] };

        const links: vscode.LocationLink[] = [];
        for (const uri of await this.getPropertyFiles(moduleRoot, declaration.baseName)) {
            if (token.isCancellationRequested) return { links: [] };
            const source = await readSource(uri);
            for (const span of findPropertyKeySpans(source, selected.name)) {
                links.push(await createLink(uri, span, originSelectionRange));
            }
        }
        return { links };
    }

    /** Evita que el autocompletado trate un alias de bundle como un bean Java. */
    public async isBundleVariable(
        document: vscode.TextDocument,
        variable: string,
        token: vscode.CancellationToken
    ): Promise<boolean> {
        const moduleRoot = await findNearestModuleRoot(document.uri);
        const declarations = await this.getDeclarations(moduleRoot);
        return (
            !token.isCancellationRequested &&
            declarations.some((item) => item.variable === variable)
        );
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
        this.invalidate();
    }

    private invalidate(): void {
        this.declarations.clear();
        this.files.clear();
    }

    private getDeclarations(moduleRoot: vscode.Uri): Promise<CachedDeclaration[]> {
        const key = moduleRoot.toString();
        const cached = this.declarations.get(key);
        if (cached) return cached;

        const lookup = (async () => {
            const direct = vscode.Uri.file(
                path.join(moduleRoot.fsPath, "src", "main", "webapp", "WEB-INF", "faces-config.xml")
            );
            const configFiles = (await exists(direct))
                ? [direct]
                : await vscode.workspace.findFiles(
                      new vscode.RelativePattern(moduleRoot, "**/WEB-INF/faces-config.xml"),
                      "**/{target,build,node_modules,.git}/**",
                      20
                  );
            const result: CachedDeclaration[] = [];
            for (const uri of configFiles) {
                const source = await readSource(uri);
                result.push(
                    ...parseResourceBundleDeclarations(source).map((declaration) => ({
                        ...declaration,
                        uri
                    }))
                );
            }
            return result;
        })();
        this.declarations.set(key, lookup);
        return lookup;
    }

    private getPropertyFiles(moduleRoot: vscode.Uri, baseName: string): Promise<vscode.Uri[]> {
        const key = `${moduleRoot.toString()}#${baseName}`;
        const cached = this.files.get(key);
        if (cached) return cached;

        const lookup = (async () => {
            const basePath = baseName.replace(/^\/+/, "").replace(/\./g, path.sep);
            const candidates = [
                vscode.Uri.file(
                    path.join(
                        moduleRoot.fsPath,
                        "src",
                        "main",
                        "resources",
                        `${basePath}.properties`
                    )
                ),
                vscode.Uri.file(
                    path.join(
                        moduleRoot.fsPath,
                        "src",
                        "main",
                        "webapp",
                        "WEB-INF",
                        "classes",
                        `${basePath}.properties`
                    )
                )
            ];
            const found: vscode.Uri[] = [];
            for (const candidate of candidates) {
                if (await exists(candidate)) found.push(candidate);
            }
            if (found.length > 0) return found;

            const portableBasePath = baseName.replace(/^\/+/, "").replace(/\./g, "/");
            return vscode.workspace.findFiles(
                new vscode.RelativePattern(
                    moduleRoot,
                    `**/{resources,WEB-INF/classes}/${portableBasePath}.properties`
                ),
                "**/{target,build,node_modules,.git}/**",
                20
            );
        })();
        this.files.set(key, lookup);
        return lookup;
    }
}

function rangeFromSpan(document: vscode.TextDocument, span: SourceSpan): vscode.Range {
    return new vscode.Range(document.positionAt(span.start), document.positionAt(span.end));
}

async function createLink(
    uri: vscode.Uri,
    span: SourceSpan,
    originSelectionRange: vscode.Range
): Promise<vscode.LocationLink> {
    const document = await vscode.workspace.openTextDocument(uri);
    const targetSelectionRange = rangeFromSpan(document, span);
    return {
        originSelectionRange,
        targetUri: uri,
        targetRange: targetSelectionRange,
        targetSelectionRange
    };
}

async function readSource(uri: vscode.Uri): Promise<string> {
    return uri.scheme === "file"
        ? readFile(uri.fsPath, "utf8")
        : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
