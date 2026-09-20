import { findElTargetAt } from "./elParser";
import { type ElTarget, type ElVariableScope } from "./types";

interface OpenElement {
    name: string;
    scopes: ElVariableScope[];
}

/**
 * Encuentra variables locales declaradas por componentes iteradores de
 * Facelets, por ejemplo p:dataTable, h:dataTable, ui:repeat o c:forEach.
 * El recorrido es lineal y se ejecuta una sola vez por versión del XHTML.
 */
export function findElVariableScopes(text: string): ElVariableScope[] {
    const result: ElVariableScope[] = [];
    const stack: OpenElement[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        const tagStart = text.indexOf("<", cursor);
        if (tagStart < 0) break;

        if (text.startsWith("<!--", tagStart)) {
            const commentEnd = text.indexOf("-->", tagStart + 4);
            cursor = commentEnd < 0 ? text.length : commentEnd + 3;
            continue;
        }
        if (text.startsWith("<![CDATA[", tagStart)) {
            const cdataEnd = text.indexOf("]]>", tagStart + 9);
            cursor = cdataEnd < 0 ? text.length : cdataEnd + 3;
            continue;
        }

        const tagEnd = findTagEnd(text, tagStart + 1);
        if (tagEnd < 0) break;
        const tag = text.slice(tagStart, tagEnd + 1);
        const name = /^<\s*\/?\s*([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(tag)?.[1];
        if (!name || /^<\s*[!?]/.test(tag)) {
            cursor = tagEnd + 1;
            continue;
        }

        if (/^<\s*\//.test(tag)) {
            closeElement(stack, name, tagStart, result);
        } else {
            const scope = extractVariableScope(tag, tagStart);
            const scopes = scope ? [scope] : [];
            if (/\/\s*>$/.test(tag)) {
                for (const item of scopes) result.push({ ...item, end: tagEnd + 1 });
            } else {
                stack.push({ name, scopes });
            }
        }
        cursor = tagEnd + 1;
    }

    for (const element of stack) {
        for (const scope of element.scopes) result.push({ ...scope, end: text.length });
    }
    return result;
}

/** Devuelve la declaración local más interna que cubre la expresión actual. */
export function findElVariableAt(
    scopes: ElVariableScope[],
    offset: number,
    variableName: string
): ElVariableScope | undefined {
    let selected: ElVariableScope | undefined;
    for (const scope of scopes) {
        if (
            scope.name === variableName &&
            offset >= scope.start &&
            offset <= scope.end &&
            (!selected || scope.start >= selected.start)
        ) {
            selected = scope;
        }
    }
    return selected;
}

function extractVariableScope(tag: string, tagStart: number): ElVariableScope | undefined {
    const attributes = new Map<string, string>();
    const attributePattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(tag)) !== null) {
        const fullName = match[1].toLowerCase();
        const localName = fullName.slice(fullName.lastIndexOf(":") + 1);
        attributes.set(localName, match[3]);
    }

    const name = attributes.get("var");
    const value = attributes.get("value") ?? attributes.get("items");
    if (!name || !value) return undefined;

    const binding = findBindingTarget(value);
    return binding ? { name, binding, start: tagStart, end: Number.MAX_SAFE_INTEGER } : undefined;
}

function findBindingTarget(value: string): ElTarget | undefined {
    const marker = Math.max(value.indexOf("#{"), value.indexOf("${"));
    return marker < 0 ? undefined : findElTargetAt(value, marker + 2);
}

function closeElement(
    stack: OpenElement[],
    name: string,
    end: number,
    result: ElVariableScope[]
): void {
    let matchIndex = -1;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === name) {
            matchIndex = index;
            break;
        }
    }
    if (matchIndex < 0) return;

    const closed = stack.splice(matchIndex);
    for (const element of closed) {
        for (const scope of element.scopes) result.push({ ...scope, end });
    }
}

function findTagEnd(text: string, start: number): number {
    let quote: '"' | "'" | undefined;
    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (quote) {
            if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === ">") {
            return index;
        }
    }
    return -1;
}
