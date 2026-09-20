import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { parseJavaBean } from "./javaParser";
import { writeLog } from "./logging";
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
    sourceRoots: vscode.Uri[];
    beans: Map<string, IndexedBean[]>;
    files: Map<string, vscode.Uri>;
    indexedFiles: Map<string, IndexedBean | undefined>;
    classFiles: Map<string, vscode.Uri[]>;
    implicitLookups: Map<string, Promise<IndexedBean[]>>;
}

const BEAN_ANNOTATION =
    /@(?:[A-Za-z_$][A-Za-z0-9_$]*\.)*(?:Named|ManagedBean|Controller|Component)\b/;

/**
 * Índice de beans separado por módulo. Los archivos se leen una sola vez y el
 * caché se actualiza cuando cambia cualquier fuente Java relevante.
 */
export class BeanIndex implements vscode.Disposable {
    private readonly caches = new Map<string, ModuleCache>();
    private readonly builds = new Map<string, Promise<ModuleCache>>();
    private readonly updates = new Map<string, Promise<void>>();
    private readonly moduleRoots = new Map<string, Promise<vscode.Uri>>();
    private readonly directLookups = new Map<string, Promise<IndexedBean[]>>();
    private readonly disposables: vscode.Disposable[] = [];

    public constructor(private readonly output: vscode.OutputChannel) {
        const watcher = vscode.workspace.createFileSystemWatcher("**/src/main/java/**/*.java");
        this.disposables.push(
            watcher,
            watcher.onDidCreate((uri) => this.queueFileUpdate(uri, false)),
            watcher.onDidChange((uri) => this.queueFileUpdate(uri, false)),
            watcher.onDidDelete((uri) => this.queueFileUpdate(uri, true))
        );
    }

    public async findBeans(
        documentUri: vscode.Uri,
        beanName: string,
        token?: vscode.CancellationToken
    ): Promise<IndexedBean[]> {
        const moduleRoot = await this.getModuleRoot(documentUri);
        const direct = await this.findDirectBeans(moduleRoot, beanName);
        if (direct.length > 0) {
            return token?.isCancellationRequested ? [] : direct;
        }

        // La construcción del índice es compartida por varias solicitudes de
        // hover/F12. No debe cancelarse cuando VS Code cancela una solicitud
        // individual al mover el cursor.
        const cache = await this.ensureModule(moduleRoot);
        if (token?.isCancellationRequested) {
            return [];
        }
        const indexed = cache.beans.get(beanName);
        if (indexed) {
            return indexed;
        }
        return this.findImplicitBeans(cache, beanName, token);
    }

    /** Lista los nombres disponibles para autocompletado dentro del módulo. */
    public async listBeans(documentUri: vscode.Uri): Promise<IndexedBeanEntry[]> {
        const moduleRoot = await this.getModuleRoot(documentUri);
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
        this.updates.clear();
        this.moduleRoots.clear();
        this.directLookups.clear();

        if (documentUri) {
            const moduleRoot = await this.getModuleRoot(documentUri);
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
            return `${cache.moduleRoot.fsPath}: ${cache.files.size} archivos Java, ${beanCount} beans`;
        });
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.caches.clear();
        this.builds.clear();
        this.updates.clear();
        this.moduleRoots.clear();
        this.directLookups.clear();
    }

    private async ensureModule(moduleRoot: vscode.Uri): Promise<ModuleCache> {
        const key = moduleRoot.fsPath;
        const cached = this.caches.get(key);
        if (cached) {
            await this.updates.get(key);
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

    /**
     * Resuelve primero el caso convencional nombreBean -> NombreBean.java.
     * Así un Ctrl+clic normal no necesita indexar todos los Java del módulo.
     */
    private findDirectBeans(moduleRoot: vscode.Uri, beanName: string): Promise<IndexedBean[]> {
        const key = `${moduleRoot.toString()}#${beanName}`;
        const cached = this.directLookups.get(key);
        if (cached) return cached;

        const className = beanName.charAt(0).toUpperCase() + beanName.slice(1);
        const lookup = (async () => {
            const roots = await getJavaSourceRoots(moduleRoot);
            const files: vscode.Uri[] = [];
            for (const root of roots) {
                files.push(
                    ...(await vscode.workspace.findFiles(
                        new vscode.RelativePattern(root, `**/${className}.java`),
                        "**/{target,build,node_modules,.git}/**"
                    ))
                );
            }
            const parsed = await Promise.all(files.map((uri) => this.parseFile(uri, true)));
            return parsed.filter(
                (bean): bean is IndexedBean =>
                    bean !== undefined && bean.beanNames.includes(beanName)
            );
        })();
        this.directLookups.set(key, lookup);
        return lookup;
    }

    private getModuleRoot(documentUri: vscode.Uri): Promise<vscode.Uri> {
        const key = documentUri.toString();
        const cached = this.moduleRoots.get(key);
        if (cached) return cached;

        const resolved = findNearestModuleRoot(documentUri);
        this.moduleRoots.set(key, resolved);
        return resolved;
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
        const indexedFiles = new Map<string, IndexedBean | undefined>();
        const classFiles = indexClassFiles(files);

        // Los lotes evitan crear miles de lecturas simultáneas en módulos grandes.
        for (let start = 0; start < files.length; start += 32) {
            const batch = files.slice(start, start + 32);
            const parsedBatch = await Promise.all(batch.map((uri) => this.parseFile(uri, false)));

            for (let index = 0; index < parsedBatch.length; index += 1) {
                const parsed = parsedBatch[index];
                indexedFiles.set(batch[index].toString(), parsed);
                if (!parsed) {
                    continue;
                }
                addBean(beans, parsed);
            }
        }

        this.log(
            "info",
            `Índice construido para ${moduleRoot.fsPath}: ${files.length} archivos, ${beans.size} nombres de bean.`
        );
        return {
            moduleRoot,
            sourceRoots: roots,
            beans,
            files: uris,
            indexedFiles,
            classFiles,
            implicitLookups: new Map()
        };
    }

    private async parseFile(
        uri: vscode.Uri,
        includeImplicitClass: boolean
    ): Promise<IndexedBean | undefined> {
        try {
            // En un workspace local usamos fsPath directamente. Algunos
            // proveedores de filesystem instalados pueden interceptar
            // workspace.fs y entregar contenido transformado.
            const source =
                uri.scheme === "file"
                    ? await readFile(uri.fsPath, "utf8")
                    : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
            if (!includeImplicitClass && !BEAN_ANNOTATION.test(source)) {
                return undefined;
            }
            const parsed = parseJavaBean(source, includeImplicitClass);
            return parsed ? { ...parsed, uri } : undefined;
        } catch (error) {
            this.log("info", `No fue posible analizar ${uri.fsPath}: ${String(error)}`);
            return undefined;
        }
    }

    private async findImplicitBeans(
        cache: ModuleCache,
        beanName: string,
        token?: vscode.CancellationToken
    ): Promise<IndexedBean[]> {
        const current = cache.implicitLookups.get(beanName);
        if (current) {
            return current;
        }

        const className = beanName.charAt(0).toUpperCase() + beanName.slice(1);
        const candidates = cache.classFiles.get(className) ?? [];
        const lookup = Promise.all(candidates.map((uri) => this.parseFile(uri, true))).then(
            (parsed) =>
                parsed.filter(
                    (bean): bean is IndexedBean =>
                        bean !== undefined && bean.beanNames.includes(beanName)
                )
        );
        cache.implicitLookups.set(beanName, lookup);
        const result = await lookup;
        return token?.isCancellationRequested ? [] : result;
    }

    private queueFileUpdate(uri: vscode.Uri, deleted: boolean): void {
        this.directLookups.clear();
        for (const [key, cache] of this.caches) {
            if (!cache.sourceRoots.some((root) => isWithin(uri.fsPath, root.fsPath))) continue;

            const previous = this.updates.get(key) ?? Promise.resolve();
            const update = previous
                .catch(() => undefined)
                .then(() => this.updateFile(key, cache, uri, deleted))
                .finally(() => {
                    if (this.updates.get(key) === update) {
                        this.updates.delete(key);
                    }
                });
            this.updates.set(key, update);
        }
    }

    private async updateFile(
        moduleKey: string,
        cache: ModuleCache,
        uri: vscode.Uri,
        deleted: boolean
    ): Promise<void> {
        if (this.caches.get(moduleKey) !== cache) return;

        const uriKey = uri.toString();
        const previous = cache.indexedFiles.get(uriKey);
        if (previous) removeBean(cache.beans, previous);

        removeClassFile(cache.classFiles, uri);
        cache.indexedFiles.delete(uriKey);
        cache.files.delete(uriKey);
        cache.implicitLookups.clear();

        if (!deleted) {
            cache.files.set(uriKey, uri);
            addClassFile(cache.classFiles, uri);
            const parsed = await this.parseFile(uri, false);
            if (this.caches.get(moduleKey) !== cache) return;
            cache.indexedFiles.set(uriKey, parsed);
            if (parsed) addBean(cache.beans, parsed);
        }

        this.log("debug", `Índice actualizado por cambio en ${uri.fsPath}`);
    }

    private log(level: "info" | "debug", message: string): void {
        writeLog(this.output, level, message);
    }
}

function addBean(beans: Map<string, IndexedBean[]>, bean: IndexedBean): void {
    for (const beanName of bean.beanNames) {
        const definitions = beans.get(beanName) ?? [];
        definitions.push(bean);
        beans.set(beanName, definitions);
    }
}

function removeBean(beans: Map<string, IndexedBean[]>, bean: IndexedBean): void {
    const uriKey = bean.uri.toString();
    for (const beanName of bean.beanNames) {
        const remaining = (beans.get(beanName) ?? []).filter(
            (candidate) => candidate.uri.toString() !== uriKey
        );
        if (remaining.length > 0) beans.set(beanName, remaining);
        else beans.delete(beanName);
    }
}

function indexClassFiles(files: vscode.Uri[]): Map<string, vscode.Uri[]> {
    const result = new Map<string, vscode.Uri[]>();
    for (const uri of files) addClassFile(result, uri);
    return result;
}

function addClassFile(classFiles: Map<string, vscode.Uri[]>, uri: vscode.Uri): void {
    const className = path.basename(uri.fsPath, ".java");
    const files = classFiles.get(className) ?? [];
    if (!files.some((candidate) => candidate.toString() === uri.toString())) {
        files.push(uri);
        classFiles.set(className, files);
    }
}

function removeClassFile(classFiles: Map<string, vscode.Uri[]>, uri: vscode.Uri): void {
    const className = path.basename(uri.fsPath, ".java");
    const remaining = (classFiles.get(className) ?? []).filter(
        (candidate) => candidate.toString() !== uri.toString()
    );
    if (remaining.length > 0) classFiles.set(className, remaining);
    else classFiles.delete(className);
}

function isWithin(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
