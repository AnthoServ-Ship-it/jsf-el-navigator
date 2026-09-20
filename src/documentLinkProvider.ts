import * as vscode from "vscode";
import { type JsfElDefinitionProvider } from "./definitionProvider";
import { commandTarget, directTarget } from "./directLink";
import { type ElAnalysisCache } from "./elAnalysisCache";
import { documentationTooltipForDefinitions } from "./javaDocumentation";

class JsfElDocumentLink extends vscode.DocumentLink {
    public constructor(
        range: vscode.Range,
        public readonly documentUri: vscode.Uri,
        public readonly offset: number
    ) {
        super(range);
    }
}

/**
 * Publica cada referencia EL directa como un enlace de documento. Esto hace
 * que Ctrl+clic use el comando de la extensión incluso cuando otro proveedor
 * HTML interfiere con el DefinitionProvider estándar de VS Code.
 */
export class JsfElDocumentLinkProvider implements vscode.DocumentLinkProvider<JsfElDocumentLink> {
    public constructor(
        private readonly analysis: ElAnalysisCache,
        private readonly definitions: JsfElDefinitionProvider
    ) {}

    public provideDocumentLinks(document: vscode.TextDocument): JsfElDocumentLink[] {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".xhtml")) {
            return [];
        }

        const links: JsfElDocumentLink[] = [];
        for (const target of this.analysis.getTargets(document)) {
            const selected = target.segments[target.selectedIndex];
            const range = new vscode.Range(
                document.positionAt(selected.start),
                document.positionAt(selected.end)
            );
            const link = new JsfElDocumentLink(range, document.uri, selected.start);
            link.tooltip = "Ir a la definición con JSF EL Navigator";
            links.push(link);
        }

        return links;
    }

    public async resolveDocumentLink(
        link: JsfElDocumentLink,
        token: vscode.CancellationToken
    ): Promise<JsfElDocumentLink> {
        const document = await vscode.workspace.openTextDocument(link.documentUri);
        const definitions = await this.definitions.resolve(
            document,
            document.positionAt(link.offset),
            token
        );
        if (token.isCancellationRequested) {
            return link;
        }

        if (!definitions || definitions.length === 0) {
            link.target = commandTarget("jsfElNavigator.goToDefinitionAt", [
                link.documentUri.toString(),
                link.offset
            ]);
            return link;
        }

        link.tooltip = await documentationTooltipForDefinitions(
            definitions,
            link.tooltip ?? "Ir a la definición con JSF EL Navigator",
            token
        );

        link.target =
            definitions.length === 1
                ? directTarget(definitions[0])
                : commandTarget("jsfElNavigator.goToDefinitionAt", [
                      link.documentUri.toString(),
                      link.offset
                  ]);
        return link;
    }
}
