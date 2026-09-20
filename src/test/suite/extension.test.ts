import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function runExtensionIntegrationTests(): Promise<void> {
    await activatesAnthoservExtension();
    await navigatesFromXhtmlToController();
    await navigatesFromControllerToService();
    await offersMultipleServiceImplementations();
    await selectsQualifiedServiceImplementation();
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
