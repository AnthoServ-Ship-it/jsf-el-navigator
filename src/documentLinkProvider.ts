import * as vscode from "vscode";
import { findAllElTargets } from "./elParser";

/**
 * Publica cada referencia EL directa como un enlace de documento. Esto hace
 * que Ctrl+clic use el comando de la extensión incluso cuando otro proveedor
 * HTML interfiere con el DefinitionProvider estándar de VS Code.
 */
export class JsfElDocumentLinkProvider implements vscode.DocumentLinkProvider {
    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".xhtml")) {
            return [];
        }

        const links: vscode.DocumentLink[] = [];
        for (const target of findAllElTargets(document.getText())) {
            const selected = target.segments[target.selectedIndex];
            const range = new vscode.Range(
                document.positionAt(selected.start),
                document.positionAt(selected.end)
            );
            const argumentsJson = JSON.stringify([document.uri.toString(), selected.start]);
            const commandUri = vscode.Uri.parse(
                `command:jsfElNavigator.goToDefinitionAt?${encodeURIComponent(argumentsJson)}`
            );
            const link = new vscode.DocumentLink(range, commandUri);
            link.tooltip = "Ir a la definición Java con JSF EL Navigator";
            links.push(link);
        }

        return links;
    }
}
