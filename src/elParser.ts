import { type ElSegment, type ElTarget } from "./types";

const IDENTIFIER = "[A-Za-z_$][A-Za-z0-9_$]*";
const ARGUMENTS = "(?:\\s*\\([^{}()]*\\))?";
const CHAIN_REGEX = new RegExp(
    `${IDENTIFIER}${ARGUMENTS}(?:\\s*\\.\\s*${IDENTIFIER}${ARGUMENTS})*`,
    "g"
);
const SEGMENT_REGEX = new RegExp(`(?:^|\\.)\\s*(${IDENTIFIER})(\\s*\\([^{}()]*\\))?`, "g");
const EL_EXPRESSION_REGEX = /(?:#|\$)\{[^}]*\}/g;
const EL_KEYWORDS = new Set([
    "and",
    "div",
    "empty",
    "eq",
    "false",
    "ge",
    "gt",
    "instanceof",
    "le",
    "lt",
    "mod",
    "ne",
    "not",
    "null",
    "or",
    "true"
]);

/**
 * Localiza el bloque #{...} o ${...} que contiene el cursor y determina
 * exactamente sobre qué identificador se solicitó la navegación.
 */
export function findElTargetAt(text: string, rawOffset: number): ElTarget | undefined {
    if (text.length === 0) {
        return undefined;
    }

    const offset = Math.max(0, Math.min(rawOffset, text.length - 1));
    const hashStart = text.lastIndexOf("#{", offset);
    const dollarStart = text.lastIndexOf("${", offset);
    const expressionMarker = Math.max(hashStart, dollarStart);

    if (expressionMarker < 0) {
        return undefined;
    }

    // Si ya hubo un cierre después del marcador, el cursor está fuera del EL.
    const previousClose = text.lastIndexOf("}", offset);
    if (previousClose > expressionMarker) {
        return undefined;
    }

    const close = text.indexOf("}", offset);
    if (close < 0) {
        return undefined;
    }

    const expressionStart = expressionMarker + 2;
    const expression = text.slice(expressionStart, close);
    const relativeOffset = offset - expressionStart;

    CHAIN_REGEX.lastIndex = 0;
    let chainMatch: RegExpExecArray | null;
    while ((chainMatch = CHAIN_REGEX.exec(expression)) !== null) {
        const chainStart = chainMatch.index;
        const chainEnd = chainStart + chainMatch[0].length;

        if (relativeOffset < chainStart || relativeOffset > chainEnd) {
            continue;
        }

        const segments = parseSegments(chainMatch[0], expressionStart + chainStart);
        const selectedIndex = segments.findIndex(
            (segment) => offset >= segment.start && offset <= segment.end
        );

        // Un clic dentro de los argumentos no representa un segmento de la cadena.
        if (segments.length === 0 || selectedIndex < 0) {
            return undefined;
        }

        return {
            expressionStart: expressionMarker,
            expressionEnd: close + 1,
            beanName: segments[0].name,
            segments,
            selectedIndex
        };
    }

    return undefined;
}

/**
 * Devuelve todos los identificadores navegables de las expresiones EL.
 * Se usa para convertirlos en enlaces y hacer que Ctrl+clic no dependa de
 * otros proveedores HTML instalados en VS Code.
 */
export function findAllElTargets(text: string): ElTarget[] {
    const targets: ElTarget[] = [];

    EL_EXPRESSION_REGEX.lastIndex = 0;
    let expressionMatch: RegExpExecArray | null;
    while ((expressionMatch = EL_EXPRESSION_REGEX.exec(text)) !== null) {
        const expression = expressionMatch[0];
        const body = expression.slice(2, -1);
        const searchableBody = maskStringLiterals(body);
        const bodyStart = expressionMatch.index + 2;

        // Cada cadena se analiza una sola vez. La implementación anterior
        // volvía a buscar la expresión completa por cada identificador y se
        // volvía cuadrática en vistas XHTML grandes.
        CHAIN_REGEX.lastIndex = 0;
        let chainMatch: RegExpExecArray | null;
        while ((chainMatch = CHAIN_REGEX.exec(searchableBody)) !== null) {
            const segments = parseSegments(chainMatch[0], bodyStart + chainMatch.index);
            if (segments.length === 0 || EL_KEYWORDS.has(segments[0].name)) {
                continue;
            }

            for (let selectedIndex = 0; selectedIndex < segments.length; selectedIndex += 1) {
                targets.push({
                    expressionStart: expressionMatch.index,
                    expressionEnd: expressionMatch.index + expression.length,
                    beanName: segments[0].name,
                    segments,
                    selectedIndex
                });
            }
        }
    }

    return targets;
}

/** Oculta texto entre comillas conservando los offsets UTF-16 originales. */
function maskStringLiterals(value: string): string {
    const chars = value.split("");
    let quote: '"' | "'" | undefined;
    let escaped = false;

    for (let index = 0; index < chars.length; index += 1) {
        const character = chars[index];
        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = undefined;
            }
            chars[index] = " ";
        } else if (character === '"' || character === "'") {
            quote = character;
            chars[index] = " ";
        }
    }
    return chars.join("");
}

function parseSegments(chain: string, absoluteStart: number): ElSegment[] {
    const segments: ElSegment[] = [];
    SEGMENT_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = SEGMENT_REGEX.exec(chain)) !== null) {
        const name = match[1];
        const nameOffset = match[0].indexOf(name);
        const start = absoluteStart + match.index + nameOffset;

        segments.push({
            name,
            start,
            end: start + name.length,
            invoked: Boolean(match[2])
        });
    }

    return segments;
}
