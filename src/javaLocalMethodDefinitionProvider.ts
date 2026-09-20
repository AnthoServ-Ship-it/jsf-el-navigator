import * as vscode from "vscode";
import { findJavaLocalMethodTargetAt } from "./javaLocalMethodParser";
import { type JavaTypeAnalysisCache } from "./javaTypeAnalysisCache";
import { type SourceSpan } from "./types";

/** Navega llamadas a métodos declarados dentro de la misma clase Java. */
export class JavaLocalMethodDefinitionProvider implements vscode.DefinitionProvider {
    public constructor(private readonly analysis: JavaTypeAnalysisCache) {}

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        return this.resolve(document, position, token);
    }

    public async resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);
        if (!enabled || token.isCancellationRequested) return undefined;

        const parsed = this.analysis.get(document);
        if (!parsed) return undefined;
        const target = findJavaLocalMethodTargetAt(
            document.getText(),
            document.offsetAt(position),
            parsed.members
        );
        if (!target) return undefined;

        const candidates = parsed.members.filter(
            (member) => member.kind === "method" && member.name === target.methodName
        );
        const sameArity = candidates.filter(
            (member) => member.parameterCount === target.argumentCount
        );
        const selected = sameArity.length > 0 ? sameArity : candidates;
        const originSelectionRange = rangeFromSpan(document, target.methodSpan);

        return selected.length > 0
            ? selected.map((member) => {
                  const targetSelectionRange = rangeFromSpan(document, member.span);
                  return {
                      originSelectionRange,
                      targetUri: document.uri,
                      targetRange: targetSelectionRange,
                      targetSelectionRange
                  };
              })
            : undefined;
    }
}

function rangeFromSpan(document: vscode.TextDocument, span: SourceSpan): vscode.Range {
    return new vscode.Range(document.positionAt(span.start), document.positionAt(span.end));
}
