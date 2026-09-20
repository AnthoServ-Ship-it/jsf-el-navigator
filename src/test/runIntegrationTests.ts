import path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    // Cuando la prueba se ejecuta desde una terminal creada por VS Code, esta
    // variable puede heredarse y obliga a Electron a comportarse como Node.
    delete process.env.ELECTRON_RUN_AS_NODE;

    const extensionDevelopmentPath = path.resolve(__dirname, "../..");
    const extensionTestsPath = path.resolve(__dirname, "suite/index");
    const fixturePath = path.resolve(extensionDevelopmentPath, "src/test/fixtures/sample-app");

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [fixturePath, "--disable-extensions"],
        version: process.env.VSCODE_TEST_VERSION
    });
}

main().catch((error) => {
    process.stderr.write(`Falló la prueba de integración: ${String(error)}\n`);
    process.exitCode = 1;
});
