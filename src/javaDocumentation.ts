import * as vscode from "vscode";
import { parseJavaMethodDocumentation } from "./javaDocumentationParser";

const tooltipCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 256;
const MAX_TOOLTIP_LENGTH = 4_000;

/**
 * Construye el texto mostrado por VS Code junto a la indicación Ctrl+clic.
 * Solo lee las definiciones ya resueltas por la navegación y conserva el
 * resultado por versión del documento para no repetir trabajo.
 */
export async function documentationTooltipForDefinitions(
    definitions: vscode.LocationLink[],
    fallback: string,
    token: vscode.CancellationToken
): Promise<string> {
    const previews: string[] = [];
    for (const definition of definitions.slice(0, 3)) {
        if (token.isCancellationRequested) return fallback;
        const document = await vscode.workspace.openTextDocument(definition.targetUri);
        const selection = definition.targetSelectionRange ?? definition.targetRange;
        const preview = documentationTooltipAt(document, document.offsetAt(selection.start));
        if (preview) previews.push(preview);
    }

    if (previews.length === 0) return fallback;
    return limitTooltip(previews.join("\n\n──────────\n\n"));
}

/** Extrae y presenta la documentación de un método del documento actual. */
export function documentationTooltipAt(
    document: vscode.TextDocument,
    methodOffset: number
): string | undefined {
    const key = `${document.uri.toString()}#${document.version}#${methodOffset}`;
    const cached = tooltipCache.get(key);
    if (cached) return cached;

    const method = parseJavaMethodDocumentation(document.getText(), methodOffset);
    if (!method) return undefined;

    const owner = method.owner ? `${method.owner}.${method.name}` : method.name;
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const tooltip = limitTooltip(
        [
            `Método: ${owner}`,
            method.signature,
            "",
            method.documentation ?? "Este método no tiene JavaDoc.",
            "",
            `Definido en: ${relativePath}:${method.line}`
        ].join("\n")
    );
    cacheTooltip(key, tooltip);
    return tooltip;
}

function cacheTooltip(key: string, tooltip: string): void {
    if (tooltipCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = tooltipCache.keys().next().value as string | undefined;
        if (oldest) tooltipCache.delete(oldest);
    }
    tooltipCache.set(key, tooltip);
}

function limitTooltip(value: string): string {
    return value.length <= MAX_TOOLTIP_LENGTH
        ? value
        : `${value.slice(0, MAX_TOOLTIP_LENGTH - 1).trimEnd()}…`;
}
