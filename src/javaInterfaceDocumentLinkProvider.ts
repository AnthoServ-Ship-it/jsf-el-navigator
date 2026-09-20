import * as vscode from "vscode";
import { commandTarget, directTarget } from "./directLink";
import { documentationTooltipForDefinitions } from "./javaDocumentation";
import { type JavaInterfaceImplementationProvider } from "./javaInterfaceImplementationProvider";
import { type JavaTypeAnalysisCache } from "./javaTypeAnalysisCache";

class JavaInterfaceDocumentLink extends vscode.DocumentLink {
    public constructor(
        range: vscode.Range,
        public readonly documentUri: vscode.Uri,
        public readonly offset: number
    ) {
        super(range);
    }
}

/** Publica enlaces directos en métodos de interfaz para que Ctrl+clic evite proveedores ajenos. */
export class JavaInterfaceDocumentLinkProvider implements vscode.DocumentLinkProvider<JavaInterfaceDocumentLink> {
    public constructor(
        private readonly analysis: JavaTypeAnalysisCache,
        private readonly definitions: JavaInterfaceImplementationProvider
    ) {}

    public provideDocumentLinks(document: vscode.TextDocument): JavaInterfaceDocumentLink[] {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);
        if (!enabled || !document.fileName.toLowerCase().endsWith(".java")) {
            return [];
        }

        const parsed = this.analysis.get(document);
        if (!parsed) {
            return [];
        }
        const source = parsed.typeKind === "class" ? document.getText() : "";

        return parsed.members
            .filter(
                (member) =>
                    member.kind === "method" &&
                    (parsed.typeKind === "interface" ||
                        (parsed.interfaceNames.length > 0 &&
                            hasOverrideAnnotation(source, member.span.start)))
            )
            .map((member) => {
                const range = new vscode.Range(
                    document.positionAt(member.span.start),
                    document.positionAt(member.span.end)
                );
                const link = new JavaInterfaceDocumentLink(range, document.uri, member.span.start);
                link.tooltip =
                    parsed.typeKind === "interface"
                        ? `Ir a la implementación de ${parsed.className}.${member.name}`
                        : `Ir a la interfaz de ${parsed.className}.${member.name}`;
                return link;
            });
    }

    public async resolveDocumentLink(
        link: JavaInterfaceDocumentLink,
        token: vscode.CancellationToken
    ): Promise<JavaInterfaceDocumentLink> {
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
            link.target = commandTarget("jsfElNavigator.goToInterfaceImplementationAt", [
                link.documentUri.toString(),
                link.offset
            ]);
            return link;
        }

        link.tooltip = await documentationTooltipForDefinitions(
            definitions,
            link.tooltip ?? "Ir al método relacionado",
            token
        );

        link.target =
            definitions.length === 1
                ? directTarget(definitions[0])
                : commandTarget("jsfElNavigator.goToInterfaceImplementationAt", [
                      link.documentUri.toString(),
                      link.offset
                  ]);
        return link;
    }
}

function hasOverrideAnnotation(source: string, methodStart: number): boolean {
    const prefixStart = Math.max(0, methodStart - 512);
    const prefix = source.slice(prefixStart, methodStart);
    const overrideStart = prefix.lastIndexOf("@Override");
    if (overrideStart < 0) return false;
    const between = prefix.slice(overrideStart + "@Override".length);
    return !/[;}]/.test(between) && /\b(?:public|protected)\b/.test(between);
}
