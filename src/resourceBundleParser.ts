import { type SourceSpan } from "./types";

export interface ResourceBundleDeclaration {
    variable: string;
    baseName: string;
    variableSpan: SourceSpan;
    baseNameSpan: SourceSpan;
}

const RESOURCE_BUNDLE = /<resource-bundle\b[^>]*>([\s\S]*?)<\/resource-bundle\s*>/gi;

/** Extrae declaraciones JSF resource-bundle conservando sus offsets originales. */
export function parseResourceBundleDeclarations(source: string): ResourceBundleDeclaration[] {
    const declarations: ResourceBundleDeclaration[] = [];
    RESOURCE_BUNDLE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = RESOURCE_BUNDLE.exec(source)) !== null) {
        const body = match[1];
        const bodyStart = match.index + match[0].indexOf(body);
        const variable = findElement(body, bodyStart, "var");
        const baseName = findElement(body, bodyStart, "base-name");
        if (!variable || !baseName) continue;

        declarations.push({
            variable: variable.value,
            baseName: baseName.value,
            variableSpan: variable.span,
            baseNameSpan: baseName.span
        });
    }
    return declarations;
}

/** Encuentra todas las declaraciones exactas de una clave en un `.properties`. */
export function findPropertyKeySpans(source: string, key: string): SourceSpan[] {
    const spans: SourceSpan[] = [];
    let lineStart = 0;

    while (lineStart <= source.length) {
        const newline = source.indexOf("\n", lineStart);
        const lineEnd = newline < 0 ? source.length : newline;
        const line = source.slice(lineStart, lineEnd).replace(/\r$/, "");
        const leadingWhitespace = /^[ \t]*/.exec(line)?.[0].length ?? 0;
        const content = line.slice(leadingWhitespace);

        if (content.length > 0 && content[0] !== "#" && content[0] !== "!") {
            const separator = findPropertySeparator(content);
            const rawKey = content.slice(0, separator).trimEnd();
            if (rawKey === key) {
                const start = lineStart + leadingWhitespace;
                spans.push({ start, end: start + rawKey.length });
            }
        }

        if (newline < 0) break;
        lineStart = newline + 1;
    }
    return spans;
}

function findElement(
    body: string,
    bodyStart: number,
    elementName: string
): { value: string; span: SourceSpan } | undefined {
    const escapedName = elementName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(
        `<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}\\s*>`,
        "i"
    ).exec(body);
    if (!match) return undefined;

    const rawValue = match[1];
    const value = rawValue.trim();
    if (!value) return undefined;
    const leadingWhitespace = rawValue.indexOf(value);
    const start = bodyStart + match.index + match[0].indexOf(rawValue) + leadingWhitespace;
    return { value, span: { start, end: start + value.length } };
}

function findPropertySeparator(value: string): number {
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (escaped) {
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (character === "=" || character === ":" || /\s/.test(character)) {
            return index;
        }
    }
    return value.length;
}
