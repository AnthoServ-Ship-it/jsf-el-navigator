import * as vscode from "vscode";
import { commandTarget, directTarget } from "./directLink";
import { documentationTooltipForDefinitions } from "./javaDocumentation";
import { type JavaServiceAnalysisCache } from "./javaServiceAnalysisCache";
import { type JavaServiceDefinitionProvider } from "./javaServiceDefinitionProvider";

class JavaServiceDocumentLink extends vscode.DocumentLink {
    public constructor(
        range: vscode.Range,
        public readonly documentUri: vscode.Uri,
        public readonly offset: number
    ) {
        super(range);
    }
}

/** Convierte llamadas de servicios inyectados en enlaces para Ctrl+clic. */
export class JavaServiceDocumentLinkProvider
    implements vscode.DocumentLinkProvider<JavaServiceDocumentLink>, vscode.Disposable
{
    private readonly linksChanged = new vscode.EventEmitter<void>();
    private readonly workspaceFoldersSubscription: vscode.Disposable;
    public readonly onDidChangeDocumentLinks = this.linksChanged.event;

    public constructor(
        private readonly analysis: JavaServiceAnalysisCache,
        private readonly definitions: JavaServiceDefinitionProvider
    ) {
        this.workspaceFoldersSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.definitions.invalidateWorkspaceCache();
            this.linksChanged.fire();
        });
    }

    public dispose(): void {
        this.workspaceFoldersSubscription.dispose();
        this.linksChanged.dispose();
    }

    public provideDocumentLinks(document: vscode.TextDocument): JavaServiceDocumentLink[] {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);

        if (!enabled || !document.fileName.toLowerCase().endsWith(".java")) {
            return [];
        }

        return this.analysis.getTargets(document).map((target) => {
            const range = new vscode.Range(
                document.positionAt(target.methodSpan.start),
                document.positionAt(target.methodSpan.end)
            );
            const link = new JavaServiceDocumentLink(range, document.uri, target.methodSpan.start);
            link.tooltip = `Ir a ${target.service.implementationClass ?? target.service.typeName}.${target.methodName}`;
            return link;
        });
    }

    public async resolveDocumentLink(
        link: JavaServiceDocumentLink,
        token: vscode.CancellationToken
    ): Promise<JavaServiceDocumentLink> {
        const document = await vscode.workspace.openTextDocument(link.documentUri);
        const definitions = await this.definitions.resolve(
            document,
            document.positionAt(link.offset),
            token
        );
        if (token.isCancellationRequested) {
            return link;
        }

        if (!definitions || definitions.length === 0) {
            link.target = commandTarget("jsfElNavigator.goToServiceDefinitionAt", [
                link.documentUri.toString(),
                link.offset
            ]);
            return link;
        }

        link.tooltip = await documentationTooltipForDefinitions(
            definitions,
            link.tooltip ?? "Ir al método del servicio",
            token
        );

        link.target =
            definitions.length === 1
                ? directTarget(definitions[0])
                : commandTarget("jsfElNavigator.goToServiceDefinitionAt", [
                      link.documentUri.toString(),
                      link.offset
                  ]);
        return link;
    }
}
