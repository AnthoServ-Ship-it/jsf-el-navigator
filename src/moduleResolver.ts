import * as path from "node:path";
import { readFile } from "node:fs/promises";
import * as vscode from "vscode";

const BUILD_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"];

/**
 * Encuentra el módulo más cercano al XHTML. Esto evita mezclar beans homónimos
 * pertenecientes a distintas aplicaciones dentro de un workspace grande.
 */
export async function findNearestModuleRoot(documentUri: vscode.Uri): Promise<vscode.Uri> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const workspaceBoundary = workspaceFolder?.uri.fsPath;
    let current = path.dirname(documentUri.fsPath);
    let sourceRootCandidate: string | undefined;

    while (true) {
        if (await isDirectory(path.join(current, "src", "main", "java"))) {
            sourceRootCandidate ??= current;

            for (const buildFile of BUILD_FILES) {
                if (await exists(path.join(current, buildFile))) {
                    return vscode.Uri.file(current);
                }
            }
        }

        if (workspaceBoundary && samePath(current, workspaceBoundary)) {
            break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    if (sourceRootCandidate) {
        return vscode.Uri.file(sourceRootCandidate);
    }

    return workspaceFolder?.uri ?? vscode.Uri.file(path.dirname(documentUri.fsPath));
}

/** Obtiene las raíces Java configuradas para un módulo. */
export async function getJavaSourceRoots(moduleRoot: vscode.Uri): Promise<vscode.Uri[]> {
    const roots: vscode.Uri[] = [];
    const conventionalRoot = vscode.Uri.file(path.join(moduleRoot.fsPath, "src", "main", "java"));

    if (await isDirectory(conventionalRoot.fsPath)) {
        roots.push(conventionalRoot);
    }

    const configuredRoots = vscode.workspace
        .getConfiguration("jsfElNavigator", moduleRoot)
        .get<string[]>("additionalJavaSourceRoots", []);

    for (const configuredRoot of configuredRoots) {
        const resolved = path.isAbsolute(configuredRoot)
            ? configuredRoot
            : path.resolve(moduleRoot.fsPath, configuredRoot);

        if (
            (await isDirectory(resolved)) &&
            !roots.some((root) => samePath(root.fsPath, resolved))
        ) {
            roots.push(vscode.Uri.file(resolved));
        }
    }

    return roots;
}

/**
 * Encuentra el agregador Maven al que pertenece el módulo actual. La búsqueda
 * de servicios queda limitada a ese proyecto y no recorre otros workspaces.
 */
export async function findProjectRoot(documentUri: vscode.Uri): Promise<vscode.Uri> {
    const moduleRoot = await findNearestModuleRoot(documentUri);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const boundary = workspaceFolder?.uri.fsPath;
    let projectRoot = moduleRoot.fsPath;
    let child = moduleRoot.fsPath;
    let parent = path.dirname(child);

    searchParents: while (parent !== child && (!boundary || isWithin(parent, boundary))) {
        const pomPath = path.join(parent, "pom.xml");
        if (await exists(pomPath)) {
            try {
                const pom = await readFile(pomPath, "utf8");
                const modules = [...pom.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map(
                    (match) => path.resolve(parent, match[1].trim())
                );
                if (modules.some((modulePath) => samePath(modulePath, child))) {
                    projectRoot = parent;
                    child = parent;
                    parent = path.dirname(parent);
                    continue searchParents;
                }
            } catch {
                // Si el POM no puede leerse, se conserva el módulo ya encontrado.
            }
        }

        const gradleSettings = ["settings.gradle", "settings.gradle.kts"].map((name) =>
            path.join(parent, name)
        );
        for (const settingsPath of gradleSettings) {
            if (!(await exists(settingsPath))) continue;
            try {
                const settings = await readFile(settingsPath, "utf8");
                const relativeChild = path.relative(parent, child).split(path.sep).join(":");
                const includedProjects = [
                    ...settings.matchAll(/["'](:?[A-Za-z0-9_.:-]+)["']/g)
                ].map((match) => match[1].replace(/^:/, ""));
                if (includedProjects.includes(relativeChild)) {
                    projectRoot = parent;
                    child = parent;
                    parent = path.dirname(parent);
                    continue searchParents;
                }
            } catch {
                // Se conserva la raíz ya encontrada.
            }
        }
        break;
    }

    return vscode.Uri.file(projectRoot);
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}

async function isDirectory(directoryPath: string): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(directoryPath));
        return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
        return false;
    }
}

function samePath(left: string, right: string): boolean {
    return path.resolve(left) === path.resolve(right);
}

function isWithin(candidate: string, boundary: string): boolean {
    const relative = path.relative(boundary, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
