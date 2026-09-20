import * as vscode from "vscode";
import { documentationTooltipAt } from "./javaDocumentation";
import { type JavaTypeAnalysisCache } from "./javaTypeAnalysisCache";

/**
 * Publica enlaces de archivo normales para llamadas locales.
 *
 * No usa un URI `command:`: VS Code puede abrir directamente el archivo y la
 * línea aun cuando otro proveedor Java esté ocupado o cancele su respuesta.
 */
export class JavaLocalMethodDocumentLinkProvider implements vscode.DocumentLinkProvider {
    public constructor(private readonly analysis: JavaTypeAnalysisCache) {}

    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const parsed = this.analysis.get(document);
        if (!parsed) return [];

        return this.analysis.getLocalTargets(document).flatMap((target) => {
            const candidates = parsed.members.filter(
                (member) => member.kind === "method" && member.name === target.methodName
            );
            const destination =
                candidates.find((member) => member.parameterCount === target.argumentCount) ??
                candidates[0];
            if (!destination) return [];

            const range = new vscode.Range(
                document.positionAt(target.methodSpan.start),
                document.positionAt(target.methodSpan.end)
            );
            const destinationStart = document.positionAt(destination.span.start);
            const destinationEnd = document.positionAt(destination.span.end);
            const fragment = `L${destinationStart.line + 1},${destinationStart.character + 1}-L${destinationEnd.line + 1},${destinationEnd.character + 1}`;
            const link = new vscode.DocumentLink(range, document.uri.with({ fragment }));
            link.tooltip =
                documentationTooltipAt(document, destination.span.start) ??
                `Ir directamente a ${target.methodName}`;
            return [link];
        });
    }
}
