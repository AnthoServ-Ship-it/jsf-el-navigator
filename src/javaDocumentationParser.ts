export interface JavaMethodDocumentation {
    name: string;
    owner: string;
    signature: string;
    documentation?: string;
    line: number;
}

/** Analiza únicamente el método seleccionado; no construye un índice Java. */
export function parseJavaMethodDocumentation(
    source: string,
    methodOffset: number
): JavaMethodDocumentation | undefined {
    const word = wordAt(source, methodOffset);
    if (!word) return undefined;

    let openParenthesis = word.end;
    while (openParenthesis < source.length && /\s/.test(source[openParenthesis])) {
        openParenthesis += 1;
    }
    if (source[openParenthesis] !== "(") return undefined;

    const closeParenthesis = findClosingParenthesis(source, openParenthesis);
    if (closeParenthesis < 0) return undefined;

    const declarationStart = findDeclarationStart(source, word.start);
    const declarationEnd = findDeclarationEnd(source, closeParenthesis);
    const signature = cleanSignature(source.slice(declarationStart, declarationEnd));
    if (!signature || !signature.includes(word.name)) return undefined;

    return {
        name: word.name,
        owner: findEnclosingType(source, declarationStart),
        signature,
        documentation: findAttachedJavaDoc(source, declarationStart),
        line: countLines(source, word.start)
    };
}

function wordAt(
    source: string,
    rawOffset: number
): { name: string; start: number; end: number } | undefined {
    const offset = Math.max(0, Math.min(rawOffset, source.length));
    let start = offset;
    while (start > 0 && /[A-Za-z0-9_$]/.test(source[start - 1])) start -= 1;
    let end = offset;
    while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) end += 1;
    const name = source.slice(start, end);
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? { name, start, end } : undefined;
}

function findDeclarationStart(source: string, methodStart: number): number {
    let start = source.lastIndexOf("\n", methodStart - 1) + 1;
    const currentLinePrefix = source.slice(start, methodStart);
    const inlineBoundary = Math.max(
        currentLinePrefix.lastIndexOf(";"),
        currentLinePrefix.lastIndexOf("{"),
        currentLinePrefix.lastIndexOf("}")
    );
    if (inlineBoundary >= 0) start += inlineBoundary + 1;
    const prefix = source.slice(start, methodStart).trim();

    // Admite firmas donde el nombre del método se coloca en una línea nueva.
    if (!/[A-Za-z0-9_$<>?\][\]]/.test(prefix)) {
        const previousLineEnd = Math.max(0, start - 1);
        const previousLineStart = source.lastIndexOf("\n", previousLineEnd - 1) + 1;
        const previousLine = source.slice(previousLineStart, previousLineEnd).trim();
        if (previousLine && !previousLine.startsWith("@") && !/[;{}]$/.test(previousLine)) {
            start = previousLineStart;
        }
    }

    while (start < methodStart && /\s/.test(source[start])) start += 1;
    return start;
}

function findDeclarationEnd(source: string, closeParenthesis: number): number {
    for (let index = closeParenthesis + 1; index < source.length; index += 1) {
        if (source[index] === "{" || source[index] === ";") return index;
    }
    return closeParenthesis + 1;
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

function cleanSignature(value: string): string {
    return value
        .replace(/^\s*(?:@[A-Za-z_$][A-Za-z0-9_$.]*(?:\s*\([^)]*\))?\s*)+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function findEnclosingType(source: string, beforeOffset: number): string {
    const prefix = source.slice(0, beforeOffset);
    const typePattern = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let typeName = "";
    let match: RegExpExecArray | null;
    while ((match = typePattern.exec(prefix)) !== null) typeName = match[1];

    const packageName = /\bpackage\s+([A-Za-z_$][A-Za-z0-9_$.]*)\s*;/.exec(prefix)?.[1];
    return packageName && typeName ? `${packageName}.${typeName}` : typeName;
}

function findAttachedJavaDoc(source: string, declarationStart: number): string | undefined {
    const searchStart = Math.max(0, declarationStart - 12_000);
    const prefix = source.slice(searchStart, declarationStart);
    const commentEnd = prefix.lastIndexOf("*/");
    if (commentEnd < 0) return undefined;

    const between = prefix.slice(commentEnd + 2);
    if (/[;{}]/.test(between)) return undefined;

    const commentStart = prefix.lastIndexOf("/**", commentEnd);
    if (commentStart < 0) return undefined;
    const rawComment = prefix.slice(commentStart + 3, commentEnd);
    return cleanJavaDoc(rawComment);
}

function cleanJavaDoc(rawComment: string): string | undefined {
    const lines = rawComment
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\*\s?/, "").trim())
        .filter((line, index, all) => line.length > 0 || (index > 0 && index < all.length - 1));

    const rendered: string[] = [];
    for (const originalLine of lines) {
        const line = cleanJavaDocMarkup(originalLine);
        const parameter = /^@param\s+(\S+)\s*(.*)$/.exec(line);
        const returns = /^@return\s*(.*)$/.exec(line);
        const throws = /^@(?:throws|exception)\s+(\S+)\s*(.*)$/.exec(line);
        if (parameter) rendered.push(`Parámetro ${parameter[1]}: ${parameter[2]}`.trimEnd());
        else if (returns) rendered.push(`Retorna: ${returns[1]}`.trimEnd());
        else if (throws) rendered.push(`Excepción ${throws[1]}: ${throws[2]}`.trimEnd());
        else if (/^@deprecated\b/.test(line)) {
            rendered.push(`Obsoleto: ${line.replace(/^@deprecated\s*/, "")}`.trimEnd());
        } else if (!/^@(author|since|see|version)\b/.test(line)) {
            rendered.push(line);
        }
    }

    const result = rendered
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return result || undefined;
}

function cleanJavaDocMarkup(value: string): string {
    return value
        .replace(/\{@code\s+([^}]+)}/g, "$1")
        .replace(
            /\{@link\s+([^}\s]+)(?:\s+([^}]+))?}/g,
            (_match, target: string, label?: string) => (label ? label : target)
        )
        .replace(/<\/?(?:p|br)\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function countLines(source: string, offset: number): number {
    let line = 1;
    for (let index = 0; index < offset; index += 1) {
        if (source[index] === "\n") line += 1;
    }
    return line;
}
