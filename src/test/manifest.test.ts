import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

interface ExtensionManifest {
    name: string;
    publisher: string;
    version: string;
    main: string;
    repository?: { url?: string };
    bugs?: { url?: string };
    contributes?: { commands?: Array<{ command: string }> };
}

test("el manifiesto contiene la identidad y los comandos públicos de anthoserv", async () => {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as ExtensionManifest;
    const commands = new Set(
        manifest.contributes?.commands?.map((command) => command.command) ?? []
    );

    assert.equal(manifest.name, "jsf-el-navigator");
    assert.equal(manifest.publisher, "anthoserv");
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(manifest.main, "./dist/extension.js");
    assert.match(manifest.repository?.url ?? "", /AnthoServ-Ship-it\/jsf-el-navigator/);
    assert.match(manifest.bugs?.url ?? "", /\/issues$/);
    assert.ok(commands.has("jsfElNavigator.goToDefinition"));
    assert.ok(commands.has("jsfElNavigator.goToServiceDefinition"));
    assert.ok(commands.has("jsfElNavigator.rebuildIndex"));
});
