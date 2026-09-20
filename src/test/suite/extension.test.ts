import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function runExtensionIntegrationTests(): Promise<void> {
    await activatesAnthoservExtension();
    await navigatesFromXhtmlToController();
    await navigatesToResourceBundle();
    await showsDocumentationWhileHoldingControl();
    await navigatesFromDataTableVariable();
    await navigatesInsideController();
    await navigatesToImportedJavaType();
    await navigatesFromControllerToService();
    await navigatesFromInterfaceToImplementation();
    await navigatesFromImplementationToInterface();
    await findsReferencesFromInterface();
    await offersMultipleServiceImplementations();
    await selectsQualifiedServiceImplementation();
}

async function showsDocumentationWhileHoldingControl(): Promise<void> {
    const workspace = requireWorkspace();

    const xhtmlUri = vscode.Uri.joinPath(workspace.uri, "web/src/main/webapp/cliente.xhtml");
    const xhtmlDocument = await vscode.workspace.openTextDocument(xhtmlUri);
    const xhtmlPosition = positionInside(xhtmlDocument, "clienteController.guardar", "guardar");
    const xhtmlLink = (await resolvedLinks(xhtmlUri)).find((link) =>
        link.range.contains(xhtmlPosition)
    );
    assert.match(xhtmlLink?.tooltip ?? "", /ClienteController\.guardar/);
    assert.match(xhtmlLink?.tooltip ?? "", /Guarda el cliente desde la vista JSF/);

    const controllerUri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/ClienteController.java"
    );
    const controller = await vscode.workspace.openTextDocument(controllerUri);
    const localPosition = positionInside(
        controller,
        "validarExistenteCorreo(obtenerCorreo())",
        "validarExistenteCorreo"
    );
    const localLink = (await resolvedLinks(controllerUri)).find((link) =>
        link.range.contains(localPosition)
    );
    assert.match(localLink?.tooltip ?? "", /ClienteController\.validarExistenteCorreo/);
    assert.match(localLink?.tooltip ?? "", /Parámetro correo: correo que se desea comprobar/);

    const servicePosition = positionInside(controller, "servicio.guardar", "guardar");
    const serviceLink = (await resolvedLinks(controllerUri)).find((link) =>
        link.range.contains(servicePosition)
    );
    assert.match(serviceLink?.tooltip ?? "", /ClienteServiceImpl\.guardar/);
    assert.match(serviceLink?.tooltip ?? "", /Persiste un cliente usando su nombre/);
}

async function navigatesToResourceBundle(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(workspace.uri, "web/src/main/webapp/cliente.xhtml");
    const document = await vscode.workspace.openTextDocument(uri);
    const keyPosition = positionInside(document, "lbl.cliente", "cliente");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, keyPosition);

    assert.ok(definitions?.length, "No se resolvió la clave del resource bundle");
    assert.match(targetUri(definitions[0]).fsPath, /EtiquetasResources\.properties$/);
    await assertDirectLinkOpens(
        uri,
        keyPosition,
        /EtiquetasResources\.properties$/,
        "la clave del resource bundle"
    );

    const aliasPosition = positionInside(document, "lbl.cliente", "lbl");
    const aliasDefinitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, aliasPosition);
    assert.ok(aliasDefinitions?.length, "No se resolvió el alias del resource bundle");
    assert.match(targetUri(aliasDefinitions[0]).fsPath, /faces-config\.xml$/);
}

async function navigatesToImportedJavaType(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/ClienteController.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "List<TicketRow>", "TicketRow");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(
        definitions?.some((definition) => /TicketRow\.java$/.test(targetUri(definition).fsPath)),
        "No se navegó al tipo Java usado por el controller"
    );
    await assertDirectLinkOpens(uri, position, /TicketRow\.java$/, "la clase Java importada");
}

async function navigatesInsideController(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/ClienteController.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(
        document,
        "validarExistenteCorreo(obtenerCorreo())",
        "validarExistenteCorreo"
    );
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(definitions?.length, "F12 no resolvió el método local del controller");
    const localDefinition = definitions.find(
        (definition) => targetUri(definition).fsPath === uri.fsPath
    );
    assert.ok(localDefinition, "La definición local no apunta al mismo controller");

    const links = await resolvedLinks(uri);
    const localLink = links?.find((link) => link.range.contains(position));
    assert.ok(localLink?.target, "Ctrl+clic no recibió el enlace local directo");
    assert.equal(localLink.target.scheme, "file", "El enlace local no apunta al archivo Java");
    assert.match(
        localLink.target.fragment,
        /^L\d+,\d+-L\d+,\d+$/,
        "El enlace local no incluye la línea de la declaración"
    );

    const declarationLine = document.positionAt(
        document.getText().lastIndexOf("public boolean validarExistenteCorreo")
    ).line;
    await vscode.commands.executeCommand("vscode.open", localLink.target);
    assert.equal(
        vscode.window.activeTextEditor?.selection.active.line,
        declarationLine,
        "Abrir el enlace de Ctrl+clic no llegó a la declaración"
    );

    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("jsfElNavigator.goToServiceDefinition");
    assert.equal(
        editor.selection.active.line,
        declarationLine,
        "F12 no abrió la declaración del método local"
    );
}

async function navigatesFromDataTableVariable(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(workspace.uri, "web/src/main/webapp/cliente.xhtml");
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "showFactura");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(definitions?.length, "No se resolvió la variable local de p:dataTable");
    assert.match(targetUri(definitions[0]).fsPath, /Ticket\.java$/);
}

async function navigatesFromImplementationToInterface(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "service/src/main/java/com/anthoserv/sample/ClienteServiceImpl.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "public void guardar", "guardar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(
        definitions?.some((definition) =>
            /ClienteService\.java$/.test(targetUri(definition).fsPath)
        ),
        "No se navegó desde la implementación hacia la interfaz"
    );

    await assertDirectLinkOpens(uri, position, /ClienteService\.java$/, "la interfaz del servicio");

    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("jsfElNavigator.goToServiceDefinition");
    assert.match(
        vscode.window.activeTextEditor?.document.uri.fsPath ?? "",
        /ClienteService\.java$/,
        "F12 no regresó directamente a la interfaz"
    );
}

async function navigatesFromInterfaceToImplementation(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "service/src/main/java/com/anthoserv/sample/ClienteService.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "guardar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(definitions?.length, "No se navegó desde la interfaz a la implementación");
    assert.match(targetUri(definitions[0]).fsPath, /ClienteServiceImpl\.java$/);

    const implementations = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeImplementationProvider", uri, position);
    assert.ok(implementations?.length, "Ctrl+F12 no encontró la implementación");
    assert.match(targetUri(implementations[0]).fsPath, /ClienteServiceImpl\.java$/);

    await assertDirectLinkOpens(
        uri,
        position,
        /ClienteServiceImpl\.java$/,
        "la implementación del servicio"
    );

    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("jsfElNavigator.goToServiceDefinition");
    assert.match(
        vscode.window.activeTextEditor?.document.uri.fsPath ?? "",
        /ClienteServiceImpl\.java$/,
        "F12 no abrió directamente la implementación"
    );
}

async function findsReferencesFromInterface(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "service/src/main/java/com/anthoserv/sample/ClienteService.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "guardar");
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        uri,
        position
    );

    assert.ok(
        references?.some((location) => /ClienteController\.java$/.test(location.uri.fsPath)),
        "Shift+F12 no encontró la llamada realizada desde el controlador"
    );
}

async function activatesAnthoservExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension("anthoserv.jsf-el-navigator");

    assert.ok(extension, "VS Code no encontró la extensión en desarrollo");
    await extension.activate();
    assert.equal(extension.isActive, true);
}

async function navigatesFromXhtmlToController(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(workspace.uri, "web/src/main/webapp/cliente.xhtml");
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "guardar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(definitions?.length, "No se resolvió la expresión EL");
    assert.match(targetUri(definitions[0]).fsPath, /ClienteController\.java$/);
    await assertDirectLinkOpens(
        uri,
        position,
        /ClienteController\.java$/,
        "el controlador desde XHTML"
    );
}

async function navigatesFromControllerToService(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/ClienteController.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "servicio.guardar", "guardar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.ok(definitions?.length, "No se resolvió la implementación del servicio");
    assert.match(targetUri(definitions[0]).fsPath, /ClienteServiceImpl\.java$/);
    await assertDirectLinkOpens(
        uri,
        position,
        /ClienteServiceImpl\.java$/,
        "el servicio desde el controlador"
    );
}

async function offersMultipleServiceImplementations(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/NotificacionController.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "servicio.enviar", "enviar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.equal(definitions?.length, 2, "No se ofrecieron ambas implementaciones");
    assert.deepEqual(
        definitions.map((definition) => targetUri(definition).fsPath.split("/").pop()).sort(),
        ["EmailNotificacionService.java", "SmsNotificacionService.java"]
    );
}

async function selectsQualifiedServiceImplementation(): Promise<void> {
    const workspace = requireWorkspace();
    const uri = vscode.Uri.joinPath(
        workspace.uri,
        "web/src/main/java/com/anthoserv/sample/PagoController.java"
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const position = positionInside(document, "servicio.procesar", "procesar");
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);

    assert.equal(definitions?.length, 1, "El calificador no seleccionó un único servicio");
    assert.match(targetUri(definitions[0]).fsPath, /PagoInternacionalService\.java$/);
}

function requireWorkspace(): vscode.WorkspaceFolder {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspace, "La prueba necesita el workspace de ejemplo");
    return workspace;
}

function positionInside(
    document: vscode.TextDocument,
    search: string,
    selectedText = search
): vscode.Position {
    const source = document.getText();
    const searchOffset = source.indexOf(search);
    assert.notEqual(searchOffset, -1, `No se encontró ${search}`);
    const selectedOffset = searchOffset + search.indexOf(selectedText) + 1;
    return document.positionAt(selectedOffset);
}

function targetUri(definition: vscode.Location | vscode.LocationLink): vscode.Uri {
    return "targetUri" in definition ? definition.targetUri : definition.uri;
}

async function resolvedLinks(uri: vscode.Uri): Promise<vscode.DocumentLink[]> {
    return (
        (await vscode.commands.executeCommand<vscode.DocumentLink[]>(
            "vscode.executeLinkProvider",
            uri,
            10_000
        )) ?? []
    );
}

async function assertDirectLinkOpens(
    uri: vscode.Uri,
    position: vscode.Position,
    expectedFile: RegExp,
    description: string
): Promise<void> {
    const links = await resolvedLinks(uri);
    const link = links.find(
        (candidate) =>
            candidate.range.contains(position) &&
            candidate.target?.scheme === "file" &&
            expectedFile.test(candidate.target.fsPath)
    );
    assert.ok(link?.target, `Ctrl+clic no resolvió ${description}`);
    assert.match(link.target.fragment, /^L\d+,\d+-L\d+,\d+$/);
    await vscode.commands.executeCommand("vscode.open", link.target);
    assert.match(
        vscode.window.activeTextEditor?.document.uri.fsPath ?? "",
        expectedFile,
        `Ctrl+clic no abrió ${description}`
    );
}
