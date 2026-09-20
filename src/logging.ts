import * as vscode from "vscode";

export type LogLevel = "info" | "debug";

/** Escribe únicamente cuando el usuario habilitó el nivel correspondiente. */
export function writeLog(
    output: vscode.OutputChannel,
    level: LogLevel,
    message: string,
    resource?: vscode.Uri
): void {
    const configured = vscode.workspace
        .getConfiguration("jsfElNavigator", resource)
        .get<"off" | "info" | "debug">("logging", "off");

    if (configured === "off" || (level === "debug" && configured !== "debug")) {
        return;
    }
    output.appendLine(`[${level.toUpperCase()}] ${message}`);
}
