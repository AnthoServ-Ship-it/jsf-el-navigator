import * as vscode from "vscode";
import { commandTarget, directTarget } from "./directLink";
import { type JavaTypeDefinitionProvider } from "./javaTypeDefinitionProvider";

const TYPE_NAME = /\b[A-Z_$][A-Za-z0-9_$]*\b/g;
const BUILT_IN_TYPES = new Set([
    "Boolean",
    "Byte",
    "Character",
    "Class",
    "Double",
    "Float",
    "Integer",
    "Long",
    "Number",
    "Object",
    "Short",
    "String",
    "StringBuilder",
    "StringBuffer",
    "Void"
]);

class JavaTypeDocumentLink extends vscode.DocumentLink {
    public constructor(
        range: vscode.Range,
        public readonly documentUri: vscode.Uri,
        public readonly offset: number
    ) {
        super(range);
    }
}

/** Navega clases y entidades importadas sin depender del servidor Java. */
export class JavaTypeDocumentLinkProvider implements vscode.DocumentLinkProvider<JavaTypeDocumentLink> {
    public constructor(private readonly definitions: JavaTypeDefinitionProvider) {}

    public provideDocumentLinks(document: vscode.TextDocument): JavaTypeDocumentLink[] {
        if (!document.fileName.toLowerCase().endsWith(".java")) return [];

        const links: JavaTypeDocumentLink[] = [];
        for (const span of findTypeSpans(document.getText())) {
            const className = span.name;
            if (BUILT_IN_TYPES.has(className)) continue;
            const link = new JavaTypeDocumentLink(
                new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)),
                document.uri,
                span.start
            );
            link.tooltip = `Abrir clase ${className}`;
            links.push(link);
        }
        return links;
    }

    public async resolveDocumentLink(
        link: JavaTypeDocumentLink,
        token: vscode.CancellationToken
    ): Promise<JavaTypeDocumentLink> {
        const document = await vscode.workspace.openTextDocument(link.documentUri);
        const definitions = await this.definitions.resolve(
            document,
            document.positionAt(link.offset),
            token
        );
        if (definitions?.length && !token.isCancellationRequested) {
            link.target = directTarget(definitions[0]);
        } else if (!token.isCancellationRequested) {
            link.target = commandTarget("editor.action.revealDefinition", []);
        }
        return link;
    }
}

function findTypeSpans(source: string): Array<{ name: string; start: number; end: number }> {
    const spans: Array<{ name: string; start: number; end: number }> = [];
    let state: "normal" | "line" | "block" | "string" | "character" = "normal";
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const current = source[index];
        const next = source[index + 1];
        if (state === "line") {
            if (current === "\n" || current === "\r") state = "normal";
        } else if (state === "block") {
            if (current === "*" && next === "/") {
                index += 1;
                state = "normal";
            }
        } else if (state === "string" || state === "character") {
            if (escaped) escaped = false;
            else if (current === "\\") escaped = true;
            else if (
                (state === "string" && current === '"') ||
                (state === "character" && current === "'")
            ) {
                state = "normal";
            }
        } else if (current === "/" && next === "/") {
            index += 1;
            state = "line";
        } else if (current === "/" && next === "*") {
            index += 1;
            state = "block";
        } else if (current === '"') {
            state = "string";
        } else if (current === "'") {
            state = "character";
        } else if (/[A-Z_$]/.test(current)) {
            TYPE_NAME.lastIndex = index;
            const match = TYPE_NAME.exec(source);
            if (match?.index === index) {
                const end = index + match[0].length;
                spans.push({ name: match[0], start: index, end });
                index = end - 1;
            }
        }
    }
    return spans;
}
