import * as vscode from "vscode";

interface DefinitionResolver {
    resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined>;
}

/** Muestra la firma y el archivo destino antes de navegar. */
export class DefinitionHoverProvider implements vscode.HoverProvider {
    public constructor(
        private readonly resolver: DefinitionResolver,
        private readonly title: string
    ) {}

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const links = await this.resolver.resolve(document, position, token);
        if (!links || links.length === 0 || token.isCancellationRequested) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${this.title}**\n\n`);
        for (const link of links.slice(0, 3)) {
            const target = await vscode.workspace.openTextDocument(link.targetUri);
            const selection = link.targetSelectionRange ?? link.targetRange;
            const line = target.lineAt(selection.start.line).text.trim();
            markdown.appendCodeblock(line, "java");
            markdown.appendMarkdown(
                `${vscode.workspace.asRelativePath(link.targetUri)}:${selection.start.line + 1}\n\n`
            );
        }
        return new vscode.Hover(markdown, links[0].originSelectionRange);
    }
}
