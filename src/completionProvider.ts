import * as vscode from "vscode";
import { type BeanIndex } from "./beanIndex";

/** Autocompleta nombres de beans y miembros Java dentro de expresiones EL. */
export class JsfElCompletionProvider implements vscode.CompletionItemProvider {
    public constructor(private readonly index: BeanIndex) {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[] | undefined> {
        const offset = document.offsetAt(position);
        const before = document.getText().slice(0, offset);
        const expressionStart = Math.max(before.lastIndexOf("#{"), before.lastIndexOf("${"));
        if (expressionStart < 0 || before.lastIndexOf("}") > expressionStart) {
            return undefined;
        }

        const expression = before.slice(expressionStart + 2);
        const root = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)?$/u.exec(expression);
        if (root) {
            const entries = await this.index.listBeans(document.uri);
            if (token.isCancellationRequested) return undefined;
            return entries.map((entry) => {
                const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Class);
                item.detail = entry.definitions.map((bean) => bean.className).join(", ");
                item.documentation = "Bean Java disponible en el módulo actual";
                return item;
            });
        }

        const member = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)?$/u.exec(
            expression
        );
        if (!member) {
            return undefined;
        }

        const beans = await this.index.findBeans(document.uri, member[1], token);
        if (token.isCancellationRequested) return undefined;
        const items = new Map<string, vscode.CompletionItem>();

        for (const bean of beans) {
            for (const javaMember of bean.members) {
                const names =
                    javaMember.kind === "method" && javaMember.propertyName
                        ? [javaMember.propertyName, javaMember.name]
                        : [javaMember.name];
                for (const name of names) {
                    if (items.has(name)) continue;
                    const item = new vscode.CompletionItem(
                        name,
                        javaMember.kind === "method"
                            ? vscode.CompletionItemKind.Method
                            : vscode.CompletionItemKind.Field
                    );
                    item.detail = javaMember.returnType
                        ? `${javaMember.returnType} — ${bean.className}`
                        : bean.className;
                    items.set(name, item);
                }
            }
        }

        return [...items.values()];
    }
}
