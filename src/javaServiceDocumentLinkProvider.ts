import * as vscode from "vscode";
import { findAllJavaServiceTargets } from "./javaServiceParser";

/** Convierte llamadas de servicios inyectados en enlaces para Ctrl+clic. */
export class JavaServiceDocumentLinkProvider implements vscode.DocumentLinkProvider {
    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".java")) {
            return [];
        }

        return findAllJavaServiceTargets(document.getText()).map((target) => {
            const range = new vscode.Range(
                document.positionAt(target.methodSpan.start),
                document.positionAt(target.methodSpan.end)
            );
            const argumentsJson = JSON.stringify([
                document.uri.toString(),
                target.methodSpan.start
            ]);
            const commandUri = vscode.Uri.parse(
                `command:jsfElNavigator.goToServiceDefinitionAt?${encodeURIComponent(argumentsJson)}`
            );
            const link = new vscode.DocumentLink(range, commandUri);
            link.tooltip = `Ir a ${target.service.implementationClass ?? target.service.typeName}.${target.methodName}`;
            return link;
        });
    }
}
