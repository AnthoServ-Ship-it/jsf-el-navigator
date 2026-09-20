import * as vscode from "vscode";
import { parseJavaBean } from "./javaParser";
import { findAllJavaLocalMethodTargets, type JavaLocalMethodTarget } from "./javaLocalMethodParser";
import { type ParsedJavaBean } from "./types";

interface CachedAnalysis {
    version: number;
    parsed: ParsedJavaBean | undefined;
    localTargets?: JavaLocalMethodTarget[];
}

/** Conserva el análisis estructural Java mientras no cambie el documento. */
export class JavaTypeAnalysisCache implements vscode.Disposable {
    private readonly entries = new Map<string, CachedAnalysis>();
    private readonly closeSubscription = vscode.workspace.onDidCloseTextDocument((document) =>
        this.entries.delete(document.uri.toString())
    );

    public get(document: vscode.TextDocument): ParsedJavaBean | undefined {
        const key = document.uri.toString();
        const cached = this.entries.get(key);
        if (cached?.version === document.version) return cached.parsed;

        const parsed = parseJavaBean(document.getText(), true);
        this.entries.set(key, { version: document.version, parsed });
        return parsed;
    }

    public getLocalTargets(document: vscode.TextDocument): JavaLocalMethodTarget[] {
        const parsed = this.get(document);
        const entry = this.entries.get(document.uri.toString());
        if (!entry || !parsed) return [];
        entry.localTargets ??= findAllJavaLocalMethodTargets(document.getText(), parsed.members);
        return entry.localTargets;
    }

    public dispose(): void {
        this.closeSubscription.dispose();
        this.entries.clear();
    }
}
