import * as vscode from "vscode";
import { BeanIndex } from "./beanIndex";
import { ElAnalysisCache } from "./elAnalysisCache";
import { JsfElDefinitionProvider } from "./definitionProvider";
import { JsfElDocumentLinkProvider } from "./documentLinkProvider";
import { JavaServiceAnalysisCache } from "./javaServiceAnalysisCache";
import { JavaServiceDefinitionProvider } from "./javaServiceDefinitionProvider";
import { JavaServiceDocumentLinkProvider } from "./javaServiceDocumentLinkProvider";
import { JavaInterfaceImplementationProvider } from "./javaInterfaceImplementationProvider";
import { JavaInterfaceDocumentLinkProvider } from "./javaInterfaceDocumentLinkProvider";
import { JavaTypeAnalysisCache } from "./javaTypeAnalysisCache";
import { JavaLocalMethodDefinitionProvider } from "./javaLocalMethodDefinitionProvider";
import { JavaLocalMethodDocumentLinkProvider } from "./javaLocalMethodDocumentLinkProvider";
import { JavaTypeDefinitionProvider } from "./javaTypeDefinitionProvider";
import { JavaTypeDocumentLinkProvider } from "./javaTypeDocumentLinkProvider";
import { writeLog } from "./logging";
import { JsfElCompletionProvider } from "./completionProvider";
import { JsfElDiagnostics } from "./diagnostics";
import { JsfJavaReferenceProvider } from "./referenceProvider";
import { ResourceBundleResolver } from "./resourceBundleResolver";

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
    const elAnalysis = new ElAnalysisCache();
    const resourceBundles = new ResourceBundleResolver();
    const definitionProvider = new JsfElDefinitionProvider(
        index,
        output,
        elAnalysis,
        resourceBundles
    );
    const documentLinkProvider = new JsfElDocumentLinkProvider(elAnalysis, definitionProvider);
    const javaServiceAnalysis = new JavaServiceAnalysisCache();
    const javaTypeAnalysis = new JavaTypeAnalysisCache();
    const javaServiceProvider = new JavaServiceDefinitionProvider(output, javaServiceAnalysis);
    const javaInterfaceProvider = new JavaInterfaceImplementationProvider(javaTypeAnalysis);
    const javaLocalMethodProvider = new JavaLocalMethodDefinitionProvider(javaTypeAnalysis);
    const javaTypeProvider = new JavaTypeDefinitionProvider();
    const javaTypeLinkProvider = new JavaTypeDocumentLinkProvider(javaTypeProvider);
    const javaLocalMethodLinkProvider = new JavaLocalMethodDocumentLinkProvider(javaTypeAnalysis);
    const javaNavigationProvider: DefinitionResolver = {
        async resolve(document, position, token) {
            return (
                (await javaLocalMethodProvider.resolve(document, position, token)) ??
                (await javaTypeProvider.resolve(document, position, token)) ??
                (await javaServiceProvider.resolve(document, position, token)) ??
                javaInterfaceProvider.resolve(document, position, token)
            );
        }
    };
    const javaServiceLinkProvider = new JavaServiceDocumentLinkProvider(
        javaServiceAnalysis,
        javaServiceProvider
    );
    const javaInterfaceLinkProvider = new JavaInterfaceDocumentLinkProvider(
        javaTypeAnalysis,
        javaInterfaceProvider
    );
    const completionProvider = new JsfElCompletionProvider(index, resourceBundles);
    const diagnostics = new JsfElDiagnostics(index, elAnalysis);
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

    const goToInterfaceImplementationAtCommand = vscode.commands.registerCommand(
        "jsfElNavigator.goToInterfaceImplementationAt",
        async (documentUri: string, offset: number) => {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
            await navigateToDefinition(
                javaInterfaceProvider,
                output,
                document,
                document.positionAt(offset),
                "JSF EL Navigator: no se encontró la interfaz o implementación relacionada."
            );
        }
    );

    const goToServiceDefinitionCommand = vscode.commands.registerCommand(
        "jsfElNavigator.goToServiceDefinition",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            await navigateJavaOrDefault(
                javaNavigationProvider,
                editor.document,
                editor.selection.active
            );
        }
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
        elAnalysis,
        resourceBundles,
        javaServiceAnalysis,
        javaTypeAnalysis,
        javaServiceProvider,
        javaServiceLinkProvider,
        javaInterfaceProvider,
        javaTypeProvider,
        diagnostics,
        goToDefinitionCommand,
        goToDefinitionAtCommand,
        goToServiceDefinitionCommand,
        goToServiceDefinitionAtCommand,
        goToInterfaceImplementationAtCommand,
        rebuildCommand,
        diagnosticsCommand,
        vscode.languages.registerDefinitionProvider(selector, definitionProvider),
        vscode.languages.registerDocumentLinkProvider(selector, documentLinkProvider),
        vscode.languages.registerCompletionItemProvider(selector, completionProvider, ".", "{"),
        vscode.languages.registerDefinitionProvider(javaSelector, javaServiceProvider),
        vscode.languages.registerDefinitionProvider(javaSelector, javaLocalMethodProvider),
        vscode.languages.registerDefinitionProvider(javaSelector, javaTypeProvider),
        vscode.languages.registerDefinitionProvider(javaSelector, javaInterfaceProvider),
        vscode.languages.registerImplementationProvider(javaSelector, javaInterfaceProvider),
        vscode.languages.registerDocumentLinkProvider(javaSelector, javaServiceLinkProvider),
        vscode.languages.registerDocumentLinkProvider(javaSelector, javaLocalMethodLinkProvider),
        vscode.languages.registerDocumentLinkProvider(javaSelector, javaTypeLinkProvider),
        vscode.languages.registerDocumentLinkProvider(javaSelector, javaInterfaceLinkProvider),
        vscode.languages.registerReferenceProvider(javaSelector, referenceProvider)
    );

    const version = String(context.extension.packageJSON.version ?? "desconocida");
    writeLog(output, "debug", `JSF EL Navigator ${version} activado.`);
}

async function navigateJavaOrDefault(
    definitionProvider: DefinitionResolver,
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<void> {
    const cancellation = new vscode.CancellationTokenSource();
    try {
        const links = await definitionProvider.resolve(document, position, cancellation.token);
        if (links && links.length > 0) {
            const selectedLink = links.length === 1 ? links[0] : await selectDefinition(links);
            if (selectedLink) {
                await openDefinition(selectedLink);
            }
            return;
        }
    } finally {
        cancellation.dispose();
    }

    await vscode.commands.executeCommand("editor.action.revealDefinition");
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
