import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

interface ExtensionManifest {
    name: string;
    publisher: string;
    version: string;
    main: string;
    activationEvents?: string[];
    repository?: { url?: string };
    bugs?: { url?: string };
    contributes?: {
        commands?: Array<{ command: string }>;
        keybindings?: Array<{ command: string; key: string; when?: string }>;
    };
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
    assert.ok(manifest.activationEvents?.includes("workspaceContains:**/*.xhtml"));
    assert.ok(manifest.activationEvents?.includes("onLanguage:java"));
    assert.equal(manifest.activationEvents?.includes("onLanguage:html"), false);
    assert.equal(manifest.activationEvents?.includes("onLanguage:xml"), false);
    assert.equal(
        manifest.contributes?.keybindings?.some(
            (binding) => binding.key.toLowerCase() === "f12" && binding.when?.includes("java")
        ),
        true,
        "La extensión debe ofrecer F12 directo en Java"
    );
});
