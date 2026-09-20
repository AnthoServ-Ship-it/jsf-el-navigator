const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const vsceCli = path.join(projectRoot, "node_modules", "@vscode", "vsce", "vsce");
const argumentsList = [vsceCli, "package", "--no-dependencies", "--allow-missing-repository"];

if (!fs.existsSync(vsceCli)) {
    console.error("No se encontró @vscode/vsce. Ejecuta npm install antes de empaquetar.");
    process.exit(1);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) {
    process.exit(run(process.execPath, argumentsList));
}

// VS Code incorpora una versión moderna de Node/Electron. Se utiliza únicamente
// para ejecutar VSCE cuando el Node del sistema es antiguo, como Node 18.
const vscodeRuntimes = [
    process.env.VSCODE_NODE_BINARY,
    "/snap/code/current/usr/share/code/code",
    "/usr/share/code/code",
    "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
    process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe")
        : undefined
].filter(Boolean);

for (const runtime of vscodeRuntimes) {
    if (fs.existsSync(runtime)) {
        const status = run(runtime, argumentsList, {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1"
        });
        if (status === 0) {
            process.exit(0);
        }
    }
}

console.error("No fue posible ejecutar VSCE. Instala Node.js 20 o define VSCODE_NODE_BINARY.");
process.exit(1);

function run(executable, args, env = process.env) {
    const result = spawnSync(executable, args, {
        cwd: projectRoot,
        env,
        stdio: "inherit"
    });
    return result.status ?? 1;
}
