import * as vscode from "vscode";
import { findAllElTargets } from "./elParser";
import { type ElTarget, type ElVariableScope } from "./types";
import { findElVariableAt, findElVariableScopes } from "./xhtmlVariableParser";

interface CachedAnalysis {
    version: number;
    targets: ElTarget[];
    variables: ElVariableScope[];
}

/** Comparte el análisis EL entre diagnósticos, enlaces, hover y navegación. */
export class ElAnalysisCache implements vscode.Disposable {
    private readonly entries = new Map<string, CachedAnalysis>();
    private readonly closeSubscription = vscode.workspace.onDidCloseTextDocument((document) =>
        this.entries.delete(document.uri.toString())
    );

    public getTargets(document: vscode.TextDocument): ElTarget[] {
        const key = document.uri.toString();
        const cached = this.entries.get(key);
        if (cached?.version === document.version) {
            return cached.targets;
        }

        const text = document.getText();
        const targets = findAllElTargets(text);
        this.entries.set(key, {
            version: document.version,
            targets,
            variables: findElVariableScopes(text)
        });
        return targets;
    }

    public findTargetAt(document: vscode.TextDocument, offset: number): ElTarget | undefined {
        const targets = this.getTargets(document);
        let low = 0;
        let high = targets.length - 1;

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const target = targets[middle];
            const selected = target.segments[target.selectedIndex];
            if (offset < selected.start) high = middle - 1;
            else if (offset > selected.end) low = middle + 1;
            else return target;
        }
        return undefined;
    }

    public findVariableAt(
        document: vscode.TextDocument,
        offset: number,
        variableName: string
    ): ElVariableScope | undefined {
        this.getTargets(document);
        const cached = this.entries.get(document.uri.toString());
        return cached ? findElVariableAt(cached.variables, offset, variableName) : undefined;
    }

    public dispose(): void {
        this.closeSubscription.dispose();
        this.entries.clear();
    }
}
