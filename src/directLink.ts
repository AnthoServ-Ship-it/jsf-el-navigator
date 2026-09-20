import * as vscode from "vscode";

/** Convierte una definición de VS Code en un enlace de archivo que abre la línea exacta. */
export function directTarget(link: vscode.LocationLink): vscode.Uri {
    const selection = link.targetSelectionRange ?? link.targetRange;
    const start = selection.start;
    const end = selection.end;
    return link.targetUri.with({
        fragment: `L${start.line + 1},${start.character + 1}-L${end.line + 1},${end.character + 1}`
    });
}

/** Conserva el selector existente cuando hay más de una definición posible. */
export function commandTarget(command: string, argumentsList: unknown[]): vscode.Uri {
    return vscode.Uri.parse(
        `command:${command}?${encodeURIComponent(JSON.stringify(argumentsList))}`
    );
}
