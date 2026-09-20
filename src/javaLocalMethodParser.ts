import { type JavaMember, type SourceSpan } from "./types";

const METHOD_CALL = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

export interface JavaLocalMethodTarget {
    methodName: string;
    argumentCount: number;
    methodSpan: SourceSpan;
}

/** Enumera llamadas locales una sola vez para publicar enlaces directos de Ctrl+clic. */
export function findAllJavaLocalMethodTargets(
    source: string,
    members: JavaMember[]
): JavaLocalMethodTarget[] {
    const methodNames = new Set(
        members.filter((member) => member.kind === "method").map((member) => member.name)
    );
    const declarationStarts = new Set(
        members.filter((member) => member.kind === "method").map((member) => member.span.start)
    );
    if (methodNames.size === 0) return [];

    const code = maskCommentsAndLiterals(source);
    const targets: JavaLocalMethodTarget[] = [];
    METHOD_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = METHOD_CALL.exec(code)) !== null) {
        const methodName = match[1];
        const methodStart = match.index;
        if (
            !methodNames.has(methodName) ||
            declarationStarts.has(methodStart) ||
            !isLocalReceiver(code, methodStart)
        ) {
            continue;
        }
        const openParenthesis = match.index + match[0].lastIndexOf("(");
        const closeParenthesis = findClosingParenthesis(code, openParenthesis);
        if (closeParenthesis < 0) continue;
        targets.push({
            methodName,
            argumentCount: countArguments(code.slice(openParenthesis + 1, closeParenthesis)),
            methodSpan: { start: methodStart, end: methodStart + methodName.length }
        });
    }
    return targets;
}

/** Resuelve solo la llamada bajo el cursor; no recorre todas las llamadas del archivo. */
export function findJavaLocalMethodTargetAt(
    source: string,
    rawOffset: number,
    members: JavaMember[]
): JavaLocalMethodTarget | undefined {
    const offset = Math.max(0, Math.min(rawOffset, source.length));
    let methodStart = offset;
    while (methodStart > 0 && /[A-Za-z0-9_$]/.test(source[methodStart - 1])) methodStart -= 1;
    let methodEnd = offset;
    while (methodEnd < source.length && /[A-Za-z0-9_$]/.test(source[methodEnd])) methodEnd += 1;
    if (methodEnd <= methodStart) return undefined;

    const methodName = source.slice(methodStart, methodEnd);
    const candidates = members.filter(
        (member) => member.kind === "method" && member.name === methodName
    );
    if (candidates.length === 0 || candidates.some((member) => member.span.start === methodStart)) {
        return undefined;
    }
    if (!isLocalReceiver(source, methodStart)) return undefined;

    let openParenthesis = methodEnd;
    while (openParenthesis < source.length && /\s/.test(source[openParenthesis])) {
        openParenthesis += 1;
    }
    if (source[openParenthesis] !== "(") return undefined;
    const closeParenthesis = findClosingParenthesis(source, openParenthesis);
    if (closeParenthesis < 0) return undefined;

    return {
        methodName,
        argumentCount: countArguments(source.slice(openParenthesis + 1, closeParenthesis)),
        methodSpan: { start: methodStart, end: methodEnd }
    };
}

function isLocalReceiver(source: string, methodStart: number): boolean {
    let previous = methodStart - 1;
    while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
    if (source[previous] !== ".") return true;

    const receiverEnd = previous;
    let receiverStart = receiverEnd - 1;
    while (receiverStart >= 0 && /[A-Za-z0-9_$]/.test(source[receiverStart])) receiverStart -= 1;
    return source.slice(receiverStart + 1, receiverEnd) === "this";
}

function findClosingParenthesis(source: string, openParenthesis: number): number {
    let depth = 0;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    for (let index = openParenthesis; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === "(") depth += 1;
        else if (character === ")") {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function countArguments(value: string): number {
    if (value.trim().length === 0) return 0;
    let count = 1;
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    for (const character of value) {
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === "(") parentheses += 1;
        else if (character === ")") parentheses -= 1;
        else if (character === "[") brackets += 1;
        else if (character === "]") brackets -= 1;
        else if (character === "{") braces += 1;
        else if (character === "}") braces -= 1;
        else if (character === "," && parentheses === 0 && brackets === 0 && braces === 0) {
            count += 1;
        }
    }
    return count;
}

function maskCommentsAndLiterals(source: string): string {
    const chars = source.split("");
    let state: "normal" | "line" | "block" | "string" | "character" = "normal";
    let escaped = false;
    for (let index = 0; index < chars.length; index += 1) {
        const current = chars[index];
        const next = chars[index + 1];
        if (state === "line") {
            if (current === "\n" || current === "\r") state = "normal";
            else chars[index] = " ";
        } else if (state === "block") {
            if (current === "*" && next === "/") {
                chars[index] = chars[index + 1] = " ";
                index += 1;
                state = "normal";
            } else if (current !== "\n" && current !== "\r") chars[index] = " ";
        } else if (state === "string" || state === "character") {
            if (current !== "\n" && current !== "\r") chars[index] = " ";
            if (escaped) escaped = false;
            else if (current === "\\") escaped = true;
            else if (
                (state === "string" && current === '"') ||
                (state === "character" && current === "'")
            ) {
                state = "normal";
            }
        } else if (current === "/" && next === "/") {
            chars[index] = chars[index + 1] = " ";
            index += 1;
            state = "line";
        } else if (current === "/" && next === "*") {
            chars[index] = chars[index + 1] = " ";
            index += 1;
            state = "block";
        } else if (current === '"') {
            chars[index] = " ";
            state = "string";
        } else if (current === "'") {
            chars[index] = " ";
            state = "character";
        }
    }
    return chars.join("");
}
