import * as vscode from "vscode";
import { type BeanIndex } from "./beanIndex";
import { findAllElTargets } from "./elParser";
import { findJavaMembers } from "./javaParser";

/** Marca beans y miembros JSF inexistentes sin molestar a bundles como #{lbl...}. */
export class JsfElDiagnostics implements vscode.Disposable {
    private readonly collection = vscode.languages.createDiagnosticCollection("jsf-el-navigator");
    private readonly disposables: vscode.Disposable[] = [];
    private readonly timers = new Map<string, NodeJS.Timeout>();

    public constructor(private readonly index: BeanIndex) {
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument((document) => this.schedule(document)),
            vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (document.fileName.toLowerCase().endsWith(".java")) {
                    for (const openDocument of vscode.workspace.textDocuments) {
                        this.schedule(openDocument);
                    }
                }
            })
        );
        for (const document of vscode.workspace.textDocuments) {
            this.schedule(document);
        }
    }

    public dispose(): void {
        for (const timer of this.timers.values()) clearTimeout(timer);
        for (const disposable of this.disposables) disposable.dispose();
        this.collection.dispose();
    }

    private schedule(document: vscode.TextDocument): void {
        if (!document.fileName.toLowerCase().endsWith(".xhtml")) return;
        const key = document.uri.toString();
        const previous = this.timers.get(key);
        if (previous) clearTimeout(previous);
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                void this.validate(document);
            }, 450)
        );
    }

    private async validate(document: vscode.TextDocument): Promise<void> {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("diagnostics.enabled", true);
        if (!enabled || document.isClosed) {
            this.collection.delete(document.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const targets = findAllElTargets(document.getText());
        const grouped = new Map<string, typeof targets>();
        for (const target of targets) {
            const current = grouped.get(target.beanName) ?? [];
            current.push(target);
            grouped.set(target.beanName, current);
        }

        for (const [beanName, beanTargets] of grouped) {
            const beans = await this.index.findBeans(document.uri, beanName);
            if (beans.length === 0) {
                if (/(?:controller|dm|bean|service)$/i.test(beanName)) {
                    for (const target of beanTargets.filter((item) => item.selectedIndex === 0)) {
                        diagnostics.push(
                            createDiagnostic(
                                document,
                                target.segments[0].start,
                                target.segments[0].end,
                                `Bean Java no encontrado en el módulo: ${beanName}`
                            )
                        );
                    }
                }
                continue;
            }

            for (const target of beanTargets.filter((item) => item.selectedIndex === 1)) {
                const selected = target.segments[1];
                const exists = beans.some(
                    (bean) => findJavaMembers(bean, selected.name, selected.invoked).length > 0
                );
                if (!exists) {
                    diagnostics.push(
                        createDiagnostic(
                            document,
                            selected.start,
                            selected.end,
                            `Miembro Java no encontrado en ${beanName}: ${selected.name}`
                        )
                    );
                }
            }
        }

        this.collection.set(document.uri, diagnostics);
    }
}

function createDiagnostic(
    document: vscode.TextDocument,
    start: number,
    end: number,
    message: string
): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(
        new vscode.Range(document.positionAt(start), document.positionAt(end)),
        message,
        vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = "JSF EL Navigator";
    return diagnostic;
}
