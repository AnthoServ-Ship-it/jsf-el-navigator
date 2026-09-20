import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { parseJavaBean } from "./javaParser";
import { findNearestModuleRoot, getJavaSourceRoots } from "./moduleResolver";
import { type ParsedJavaBean } from "./types";

export interface IndexedBean extends ParsedJavaBean {
    uri: vscode.Uri;
}

export interface IndexedBeanEntry {
    name: string;
    definitions: IndexedBean[];
}

interface ModuleCache {
    moduleRoot: vscode.Uri;
    javaFiles: number;
    beans: Map<string, IndexedBean[]>;
}

/**
 * Índice de beans separado por módulo. Los archivos se leen una sola vez y el
 * caché se invalida cuando cambia cualquier fuente Java relevante.
 */
export class BeanIndex implements vscode.Disposable {
    private readonly caches = new Map<string, ModuleCache>();
    private readonly builds = new Map<string, Promise<ModuleCache>>();
    private readonly disposables: vscode.Disposable[] = [];

    public constructor(private readonly output: vscode.OutputChannel) {
        const watcher = vscode.workspace.createFileSystemWatcher("**/src/main/java/**/*.java");
        this.disposables.push(
            watcher,
            watcher.onDidCreate((uri) => this.invalidateFor(uri)),
            watcher.onDidChange((uri) => this.invalidateFor(uri)),
            watcher.onDidDelete((uri) => this.invalidateFor(uri))
        );
    }

    public async findBeans(
        documentUri: vscode.Uri,
        beanName: string,
        token?: vscode.CancellationToken
    ): Promise<IndexedBean[]> {
        const moduleRoot = await findNearestModuleRoot(documentUri);
        // La construcción del índice es compartida por varias solicitudes de
        // hover/F12. No debe cancelarse cuando VS Code cancela una solicitud
        // individual al mover el cursor.
        const cache = await this.ensureModule(moduleRoot);
        if (token?.isCancellationRequested) {
            return [];
        }
        return cache.beans.get(beanName) ?? [];
    }

    /** Lista los nombres disponibles para autocompletado dentro del módulo. */
    public async listBeans(documentUri: vscode.Uri): Promise<IndexedBeanEntry[]> {
        const moduleRoot = await findNearestModuleRoot(documentUri);
        const cache = await this.ensureModule(moduleRoot);
        return [...cache.beans.entries()].map(([name, definitions]) => ({
            name,
            definitions
        }));
    }

    /** Elimina el caché y reconstruye el módulo del documento activo. */
    public async rebuild(documentUri?: vscode.Uri): Promise<void> {
        this.caches.clear();
        this.builds.clear();

        if (documentUri) {
            const moduleRoot = await findNearestModuleRoot(documentUri);
            await this.ensureModule(moduleRoot);
        }
    }

    public describe(): string[] {
        if (this.caches.size === 0) {
            return ["Todavía no se ha indexado ningún módulo."];
        }

        return [...this.caches.values()].map((cache) => {
            const beanCount = [...cache.beans.values()].reduce(
                (total, definitions) => total + definitions.length,
                0
            );
            return `${cache.moduleRoot.fsPath}: ${cache.javaFiles} archivos Java, ${beanCount} beans`;
        });
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.caches.clear();
        this.builds.clear();
    }

    private async ensureModule(moduleRoot: vscode.Uri): Promise<ModuleCache> {
        const key = moduleRoot.fsPath;
        const cached = this.caches.get(key);
        if (cached) {
            return cached;
        }

        const currentBuild = this.builds.get(key);
        if (currentBuild) {
            return currentBuild;
        }

        const build = this.buildModule(moduleRoot)
            .then((cache) => {
                this.caches.set(key, cache);
                return cache;
            })
            .finally(() => this.builds.delete(key));

        this.builds.set(key, build);
        return build;
    }

    private async buildModule(moduleRoot: vscode.Uri): Promise<ModuleCache> {
        const roots = await getJavaSourceRoots(moduleRoot);
        const uris = new Map<string, vscode.Uri>();

        for (const root of roots) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(root, "**/*.java"),
                "**/{target,build,node_modules,.git}/**"
            );
            for (const file of files) {
                uris.set(file.toString(), file);
            }
        }

        const beans = new Map<string, IndexedBean[]>();
        const files = [...uris.values()];

        // Los lotes evitan crear miles de lecturas simultáneas en módulos grandes.
        for (let start = 0; start < files.length; start += 32) {
            const batch = files.slice(start, start + 32);
            const parsedBatch = await Promise.all(batch.map((uri) => this.parseFile(uri)));

            for (const parsed of parsedBatch) {
                if (!parsed) {
                    continue;
                }
                for (const beanName of parsed.beanNames) {
                    const definitions = beans.get(beanName) ?? [];
                    definitions.push(parsed);
                    beans.set(beanName, definitions);
                }
            }
        }

        this.log(
            "info",
            `Índice construido para ${moduleRoot.fsPath}: ${files.length} archivos, ${beans.size} nombres de bean.`
        );
        return {
            moduleRoot,
            javaFiles: files.length,
            beans
        };
    }

    private async parseFile(uri: vscode.Uri): Promise<IndexedBean | undefined> {
        try {
            // En un workspace local usamos fsPath directamente. Algunos
            // proveedores de filesystem instalados pueden interceptar
            // workspace.fs y entregar contenido transformado.
            const source =
                uri.scheme === "file"
                    ? await readFile(uri.fsPath, "utf8")
                    : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
            const parsed = parseJavaBean(source, true);
            return parsed ? { ...parsed, uri } : undefined;
        } catch (error) {
            this.log("info", `No fue posible analizar ${uri.fsPath}: ${String(error)}`);
            return undefined;
        }
    }

    private invalidateFor(uri: vscode.Uri): void {
        for (const [key, cache] of this.caches) {
            if (uri.fsPath.startsWith(cache.moduleRoot.fsPath)) {
                this.caches.delete(key);
                this.log("debug", `Índice invalidado por cambio en ${uri.fsPath}`);
            }
        }
    }

    private log(level: "info" | "debug", message: string): void {
        const configured = vscode.workspace
            .getConfiguration("jsfElNavigator")
            .get<"off" | "info" | "debug">("logging", "info");

        if (configured === "off" || (level === "debug" && configured !== "debug")) {
            return;
        }
        this.output.appendLine(`[${level.toUpperCase()}] ${message}`);
    }
}
