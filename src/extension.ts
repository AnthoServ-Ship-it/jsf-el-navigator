import * as vscode from "vscode";
import { BeanIndex } from "./beanIndex";
import { JsfElDefinitionProvider } from "./definitionProvider";
import { JsfElDocumentLinkProvider } from "./documentLinkProvider";
import { JavaServiceDefinitionProvider } from "./javaServiceDefinitionProvider";
import { JavaServiceDocumentLinkProvider } from "./javaServiceDocumentLinkProvider";
import { JsfElCompletionProvider } from "./completionProvider";
import { JsfElDiagnostics } from "./diagnostics";
import { DefinitionHoverProvider } from "./hoverProvider";
import { JsfJavaReferenceProvider } from "./referenceProvider";

interface DefinitionResolver {
    resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined>;
}

/** Punto de entrada de JSF EL Navigator. */
export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("JSF EL Navigator");
    const index = new BeanIndex(output);
    const definitionProvider = new JsfElDefinitionProvider(index, output);
    const documentLinkProvider = new JsfElDocumentLinkProvider();
    const javaServiceProvider = new JavaServiceDefinitionProvider(output);
    const javaServiceLinkProvider = new JavaServiceDocumentLinkProvider();
    const completionProvider = new JsfElCompletionProvider(index);
    const diagnostics = new JsfElDiagnostics(index);
    const referenceProvider = new JsfJavaReferenceProvider();

    // El patrón garantiza soporte para .xhtml aunque el usuario lo tenga asociado
    // al modo HTML, XML, XHTML o a otro modo compatible.
    const selector: vscode.DocumentSelector = [
        { scheme: "file", language: "html", pattern: "**/*.xhtml" },
        { scheme: "file", language: "xml", pattern: "**/*.xhtml" },
        { scheme: "file", language: "xhtml", pattern: "**/*.xhtml" },
        { scheme: "file", pattern: "**/*.xhtml" }
    ];
    const javaSelector: vscode.DocumentSelector = [
        { scheme: "file", language: "java", pattern: "**/*.java" }
    ];

    const goToDefinitionCommand = vscode.commands.registerTextEditorCommand(
        "jsfElNavigator.goToDefinition",
        (editor) =>
            navigateToDefinition(
                definitionProvider,
                output,
                editor.document,
                editor.selection.active,
                "JSF EL Navigator: no se encontró la definición EL. Revisa el canal de salida."
            )
    );

    const goToDefinitionAtCommand = vscode.commands.registerCommand(
        "jsfElNavigator.goToDefinitionAt",
        async (documentUri: string, offset: number) => {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
            await navigateToDefinition(
                definitionProvider,
                output,
                document,
                document.positionAt(offset),
                "JSF EL Navigator: no se encontró la definición EL. Revisa el canal de salida."
            );
        }
    );

    const goToServiceDefinitionAtCommand = vscode.commands.registerCommand(
        "jsfElNavigator.goToServiceDefinitionAt",
        async (documentUri: string, offset: number) => {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
            await navigateToDefinition(
                javaServiceProvider,
                output,
                document,
                document.positionAt(offset),
                "JSF EL Navigator: no se encontró el método del servicio. Revisa el canal de salida."
            );
        }
    );

    const goToServiceDefinitionCommand = vscode.commands.registerTextEditorCommand(
        "jsfElNavigator.goToServiceDefinition",
        (editor) =>
            navigateToDefinition(
                javaServiceProvider,
                output,
                editor.document,
                editor.selection.active,
                "JSF EL Navigator: no se encontró el método del servicio. Revisa el canal de salida."
            )
    );

    const rebuildCommand = vscode.commands.registerCommand(
        "jsfElNavigator.rebuildIndex",
        async () => {
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "JSF EL Navigator: reconstruyendo índice Java"
                },
                () => index.rebuild(activeUri)
            );
            void vscode.window.showInformationMessage("JSF EL Navigator: índice reconstruido.");
        }
    );

    const diagnosticsCommand = vscode.commands.registerCommand(
        "jsfElNavigator.showDiagnostics",
        () => {
            output.clear();
            output.appendLine("JSF EL Navigator — diagnóstico del índice");
            output.appendLine("Autor: anthoserv");
            output.appendLine("");
            for (const line of index.describe()) {
                output.appendLine(line);
            }
            output.show(true);
        }
    );

    context.subscriptions.push(
        output,
        index,
        diagnostics,
        goToDefinitionCommand,
        goToDefinitionAtCommand,
        goToServiceDefinitionCommand,
        goToServiceDefinitionAtCommand,
        rebuildCommand,
        diagnosticsCommand,
        vscode.languages.registerDefinitionProvider(selector, definitionProvider),
        vscode.languages.registerDocumentLinkProvider(selector, documentLinkProvider),
        vscode.languages.registerHoverProvider(
            selector,
            new DefinitionHoverProvider(definitionProvider, "Definición JSF/Java")
        ),
        vscode.languages.registerCompletionItemProvider(selector, completionProvider, ".", "{"),
        vscode.languages.registerDefinitionProvider(javaSelector, javaServiceProvider),
        vscode.languages.registerDocumentLinkProvider(javaSelector, javaServiceLinkProvider),
        vscode.languages.registerHoverProvider(
            javaSelector,
            new DefinitionHoverProvider(javaServiceProvider, "Implementación del servicio")
        ),
        vscode.languages.registerReferenceProvider(javaSelector, referenceProvider)
    );

    const version = String(context.extension.packageJSON.version ?? "desconocida");
    output.appendLine(`JSF EL Navigator ${version} activado.`);
}

export function deactivate(): void {
    // Los recursos se liberan automáticamente mediante context.subscriptions.
}

async function navigateToDefinition(
    definitionProvider: DefinitionResolver,
    output: vscode.OutputChannel,
    document: vscode.TextDocument,
    position: vscode.Position,
    notFoundMessage: string
): Promise<void> {
    const cancellation = new vscode.CancellationTokenSource();
    try {
        const links = await definitionProvider.resolve(document, position, cancellation.token);

        if (!links || links.length === 0) {
            output.show(true);
            void vscode.window.showWarningMessage(notFoundMessage);
            return;
        }

        const selectedLink = links.length === 1 ? links[0] : await selectDefinition(links);

        if (selectedLink) {
            await openDefinition(selectedLink);
        }
    } finally {
        cancellation.dispose();
    }
}

async function selectDefinition(
    links: vscode.LocationLink[]
): Promise<vscode.LocationLink | undefined> {
    const items = await Promise.all(
        links.map(async (link) => {
            const document = await vscode.workspace.openTextDocument(link.targetUri);
            const selection = link.targetSelectionRange ?? link.targetRange;
            const line = selection.start.line;
            return {
                label: `${vscode.workspace.asRelativePath(link.targetUri)}:${line + 1}`,
                description: document.lineAt(line).text.trim(),
                link
            };
        })
    );

    return (
        await vscode.window.showQuickPick(items, {
            title: "Selecciona la definición Java",
            placeHolder: "Se encontraron varias definiciones en el módulo"
        })
    )?.link;
}

async function openDefinition(link: vscode.LocationLink): Promise<void> {
    const selection = link.targetSelectionRange ?? link.targetRange;
    const editor = await vscode.window.showTextDocument(link.targetUri, {
        preview: true,
        selection
    });
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
