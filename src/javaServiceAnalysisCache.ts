import * as vscode from "vscode";
import { findAllJavaServiceTargets, type JavaServiceTarget } from "./javaServiceParser";

interface CachedAnalysis {
    version: number;
    targets: JavaServiceTarget[];
}

/** Comparte el análisis Java entre enlaces, hover y navegación. */
export class JavaServiceAnalysisCache implements vscode.Disposable {
    private readonly entries = new Map<string, CachedAnalysis>();
    private readonly closeSubscription = vscode.workspace.onDidCloseTextDocument((document) =>
        this.entries.delete(document.uri.toString())
    );

    public getTargets(document: vscode.TextDocument): JavaServiceTarget[] {
        const key = document.uri.toString();
        const cached = this.entries.get(key);
        if (cached?.version === document.version) {
            return cached.targets;
        }

        const targets = findAllJavaServiceTargets(document.getText());
        this.entries.set(key, { version: document.version, targets });
        return targets;
    }

    public findTargetAt(
        document: vscode.TextDocument,
        offset: number
    ): JavaServiceTarget | undefined {
        const targets = this.getTargets(document);
        let low = 0;
        let high = targets.length - 1;

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const target = targets[middle];
            if (offset < target.methodSpan.start) high = middle - 1;
            else if (offset > target.methodSpan.end) low = middle + 1;
            else return target;
        }
        return undefined;
    }

    public dispose(): void {
        this.closeSubscription.dispose();
        this.entries.clear();
    }
}
