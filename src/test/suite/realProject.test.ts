import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function runRealProjectIntegrationTests(): Promise<void> {
    const extension = vscode.extensions.getExtension("anthoserv.jsf-el-navigator");
    assert.ok(extension);
    await extension.activate();

    await assertDefinition(
        "samasat-manzanilla-1-4/sitti-web/src/main/webapp/pages/secure/choferes/formCorreoFinal.xhtml",
        "choferesController.agregarCorreo",
        "agregarCorreo",
        /ChoferesController\.java$/
    );
    await assertDefinition(
        "samasat-manzanilla-1-4/sitti-web/src/main/java/com/samasat/manzanilla/controller/ChoferesController.java",
        "facadeChoferes.buscarTipo(configFiltros)",
        "buscarTipo",
        /FacadeChoferesServiceImpl\.java$/
    );
    await assertDefinition(
        "samasat-manzanilla-1-4/sitti-web/src/main/java/com/samasat/manzanilla/controller/ChoferesController.java",
        "entidadesServicio.buscarCorreo",
        "buscarCorreo",
        /TgenEntidadesServicesImpl\.java$/
    );
    await assertDefinition(
        "samasat-manzanilla-1-4/sitti-web/src/main/java/com/samasat/manzanilla/controller/ChoferesController.java",
        "import com.samasatsa.entidades.model.TgenCorreo",
        "TgenCorreo",
        /TgenCorreo\.java$/
    );
    await assertDefinition(
        "samasat-manzanilla-1-4/manzanilla-service/src/main/java/com/samasat/manzanilla/service/Impl/FacadeChoferesServiceImpl.java",
        "public List<TgenChoferes> buscarTipo(Map<String, Object> configFiltros)",
        "buscarTipo",
        /FacadeChoferesService\.java$/
    );
}

async function assertDefinition(
    relativePath: string,
    search: string,
    selectedText: string,
    expectedFile: RegExp
): Promise<void> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspace);
    const uri = vscode.Uri.joinPath(workspace.uri, relativePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const searchOffset = document.getText().indexOf(search);
    assert.notEqual(searchOffset, -1, `No se encontró ${search}`);
    const position = document.positionAt(searchOffset + search.indexOf(selectedText) + 1);
    const definitions = await vscode.commands.executeCommand<
        Array<vscode.Location | vscode.LocationLink>
    >("vscode.executeDefinitionProvider", uri, position);
    assert.ok(
        definitions?.some((definition) => expectedFile.test(targetUri(definition).fsPath)),
        `${selectedText} no abrió ${expectedFile.source}`
    );
}

function targetUri(definition: vscode.Location | vscode.LocationLink): vscode.Uri {
    return "targetUri" in definition ? definition.targetUri : definition.uri;
}
