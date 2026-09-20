import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { parseJavaBean } from "./javaParser";
import { findProjectRoot } from "./moduleResolver";

/** Navega tipos Java importados mediante una búsqueda dirigida por ruta. */
export class JavaTypeDefinitionProvider implements vscode.DefinitionProvider, vscode.Disposable {
    private readonly files = new Map<string, Promise<vscode.Uri[]>>();

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
        if (!document.fileName.toLowerCase().endsWith(".java")) return undefined;
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
        if (!wordRange) return undefined;

        const className = document.getText(wordRange);
        if (!/^[A-Z_$][A-Za-z0-9_$]*$/.test(className)) return undefined;

        const source = document.getText();
        const qualifiedName = findQualifiedName(source, className);
        if (!qualifiedName) return undefined;

        const projectRoot = await findProjectRoot(document.uri);
        const relativePath = `${qualifiedName.replace(/\./g, "/")}.java`;
        const key = `${projectRoot.toString()}#${relativePath}`;
        let lookup = this.files.get(key);
        if (!lookup) {
            lookup = (async () => {
                const projectFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(projectRoot, `**/src/main/java/${relativePath}`),
                    "**/{target,build,node_modules,.git}/**"
                );
                if (projectFiles.length > 0) return projectFiles;
                return vscode.workspace.findFiles(
                    `**/src/main/java/${relativePath}`,
                    "**/{target,build,node_modules,.git}/**"
                );
            })();
            this.files.set(key, lookup);
        }

        const links: vscode.LocationLink[] = [];
        for (const uri of await lookup) {
            if (token.isCancellationRequested) return undefined;
            const targetDocument = await vscode.workspace.openTextDocument(uri);
            const targetSource =
                uri.scheme === "file"
                    ? await readFile(uri.fsPath, "utf8")
                    : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
            const parsed = parseJavaBean(targetSource, true);
            if (!parsed || parsed.className !== className) continue;
            const targetSelectionRange = new vscode.Range(
                targetDocument.positionAt(parsed.classSpan.start),
                targetDocument.positionAt(parsed.classSpan.end)
            );
            links.push({
                originSelectionRange: wordRange,
                targetUri: uri,
                targetRange: targetSelectionRange,
                targetSelectionRange
            });
        }
        return links.length > 0 ? links : undefined;
    }

    public dispose(): void {
        this.files.clear();
    }
}

function findQualifiedName(source: string, className: string): string | undefined {
    const escapedName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imported = new RegExp(
        `\\bimport\\s+(?!static\\b)([A-Za-z_$][A-Za-z0-9_$.]*\\.${escapedName})\\s*;`
    ).exec(source)?.[1];
    if (imported) return imported;

    const packageName = /\bpackage\s+([A-Za-z_$][A-Za-z0-9_$.]*)\s*;/.exec(source)?.[1];
    return packageName ? `${packageName}.${className}` : undefined;
}
