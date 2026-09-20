import { type SourceSpan } from "./types";

const FIELD_DECLARATION =
    /\b(?:private|protected|public)[ \t]+(?:(?:static|final|transient|volatile)[ \t]+)*([A-Za-z_$][A-Za-z0-9_$.]*(?:[ \t]*<[^;={}\r\n]+>)?(?:[ \t]*\[[ \t]*\])?)[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*(?:=[^;\r\n]*)?;/g;
const METHOD_CALL = /\b([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\.[ \t]*([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\(/g;
const INJECTION_ANNOTATION = /@(?:[A-Za-z_$][A-Za-z0-9_$]*\.)*(?:EJB|Inject|Autowired)\b/;

export interface InjectedJavaService {
    fieldName: string;
    typeName: string;
    implementationClass?: string;
    interfaceName?: string;
}

export interface JavaServiceTarget {
    service: InjectedJavaService;
    methodName: string;
    argumentCount: number;
    argumentExpressions: string[];
    argumentTypes: Array<string | undefined>;
    receiverSpan: SourceSpan;
    methodSpan: SourceSpan;
}

/** Encuentra llamadas realizadas sobre campos de servicio inyectados. */
export function findAllJavaServiceTargets(source: string): JavaServiceTarget[] {
    const services = findInjectedServices(source);
    if (services.size === 0) {
        return [];
    }

    const code = maskCommentsAndLiterals(source);
    const targets: JavaServiceTarget[] = [];
    METHOD_CALL.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = METHOD_CALL.exec(code)) !== null) {
        const receiverName = match[1];
        const methodName = match[2];
        const service = services.get(receiverName);
        if (!service) {
            continue;
        }

        const receiverStart = match.index;
        const callStart = match.index;
        const methodStart = match.index + match[0].lastIndexOf(methodName);
        const openParenthesis = match.index + match[0].lastIndexOf("(");
        const closeParenthesis = findClosingParenthesis(code, openParenthesis);
        if (closeParenthesis < 0) {
            continue;
        }
        const argumentExpressions = splitArguments(
            code,
            source,
            openParenthesis + 1,
            closeParenthesis
        );
        targets.push({
            service,
            methodName,
            argumentCount: argumentExpressions.length,
            argumentExpressions,
            argumentTypes: argumentExpressions.map((expression) =>
                inferArgumentType(expression, source.slice(0, callStart))
            ),
            receiverSpan: {
                start: receiverStart,
                end: receiverStart + receiverName.length
            },
            methodSpan: {
                start: methodStart,
                end: methodStart + methodName.length
            }
        });
    }

    return targets;
}

function findClosingParenthesis(source: string, openParenthesis: number): number {
    let depth = 0;
    for (let index = openParenthesis; index < source.length; index += 1) {
        if (source[index] === "(") {
            depth += 1;
        } else if (source[index] === ")") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function splitArguments(
    maskedSource: string,
    originalSource: string,
    start: number,
    end: number
): string[] {
    if (originalSource.slice(start, end).trim().length === 0) {
        return [];
    }

    const argumentsList: string[] = [];
    let argumentStart = start;
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;

    for (let index = start; index < end; index += 1) {
        const character = maskedSource[index];
        if (character === "(") {
            parentheses += 1;
        } else if (character === ")") {
            parentheses -= 1;
        } else if (character === "[") {
            brackets += 1;
        } else if (character === "]") {
            brackets -= 1;
        } else if (character === "{") {
            braces += 1;
        } else if (character === "}") {
            braces -= 1;
        } else if (character === "," && parentheses === 0 && brackets === 0 && braces === 0) {
            argumentsList.push(originalSource.slice(argumentStart, index).trim());
            argumentStart = index + 1;
        }
    }

    argumentsList.push(originalSource.slice(argumentStart, end).trim());
    return argumentsList;
}

function inferArgumentType(expression: string, sourceBeforeCall: string): string | undefined {
    const value = expression.trim();
    if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return "String";
    if (/^'(?:[^'\\]|\\.)'$/.test(value)) return "char";
    if (/^(?:true|false)$/.test(value)) return "boolean";
    if (/^-?\d+[lL]$/.test(value)) return "long";
    if (/^-?\d+[fF]$/.test(value)) return "float";
    if (/^-?\d+(?:\.\d+)?[dD]?$/.test(value)) return value.includes(".") ? "double" : "int";

    const constructor = /^new\s+([A-Za-z_$][A-Za-z0-9_$.]*)/.exec(value)?.[1];
    if (constructor) return simpleTypeName(constructor);
    const cast = /^\(\s*([A-Za-z_$][A-Za-z0-9_$.<>?]*)\s*\)/.exec(value)?.[1];
    if (cast) return simpleTypeName(cast);
    const enumType = /^([A-Z][A-Za-z0-9_$]*)\s*\./.exec(value)?.[1];
    if (enumType) return enumType;

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const declaration = new RegExp(
            `\\b([A-Za-z_$][A-Za-z0-9_$.]*(?:\\s*<[^;={}\\r\\n]+>)?(?:\\s*\\[\\s*\\])?)\\s+${escaped}\\b`,
            "g"
        );
        let match: RegExpExecArray | null;
        let typeName: string | undefined;
        while ((match = declaration.exec(sourceBeforeCall)) !== null) {
            typeName = simpleTypeName(match[1]);
        }
        return typeName;
    }

    return undefined;
}

/** Localiza la llamada de servicio cuyo método contiene el cursor. */
export function findJavaServiceTargetAt(
    source: string,
    offset: number
): JavaServiceTarget | undefined {
    return findAllJavaServiceTargets(source).find(
        (target) => offset >= target.methodSpan.start && offset <= target.methodSpan.end
    );
}

function findInjectedServices(source: string): Map<string, InjectedJavaService> {
    const services = new Map<string, InjectedJavaService>();
    FIELD_DECLARATION.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = FIELD_DECLARATION.exec(source)) !== null) {
        const boundary = Math.max(
            source.lastIndexOf(";", match.index - 1),
            source.lastIndexOf("{", match.index - 1),
            source.lastIndexOf("}", match.index - 1)
        );
        const annotations = source.slice(boundary + 1, match.index);
        if (!INJECTION_ANNOTATION.test(annotations)) {
            continue;
        }

        const typeName = simpleTypeName(match[1]);
        const fieldName = match[2];
        const lookup = /\blookup\s*=\s*"([^"]+)"/.exec(annotations)?.[1];
        const lookupParts = lookup?.split("!");
        const beanBinding = lookupParts?.[0];
        const beanName = beanBinding
            ? beanBinding.slice(beanBinding.lastIndexOf("/") + 1)
            : undefined;

        services.set(fieldName, {
            fieldName,
            typeName,
            implementationClass: beanName || undefined,
            interfaceName: lookupParts?.[1]
        });
    }

    return services;
}

function simpleTypeName(rawType: string): string {
    const withoutGenerics = rawType
        .replace(/<.*>/, "")
        .replace(/\[\s*\]/g, "")
        .trim();
    return withoutGenerics.slice(withoutGenerics.lastIndexOf(".") + 1);
}

/** Enmascara comentarios y literales conservando todos los offsets originales. */
function maskCommentsAndLiterals(source: string): string {
    const chars = source.split("");
    let state: "normal" | "line" | "block" | "string" | "character" = "normal";
    let escaped = false;

    for (let index = 0; index < chars.length; index += 1) {
        const current = chars[index];
        const next = chars[index + 1];

        if (state === "line") {
            if (current === "\n" || current === "\r") {
                state = "normal";
            } else {
                chars[index] = " ";
            }
            continue;
        }

        if (state === "block") {
            if (current === "*" && next === "/") {
                chars[index] = " ";
                chars[index + 1] = " ";
                index += 1;
                state = "normal";
            } else if (current !== "\n" && current !== "\r") {
                chars[index] = " ";
            }
            continue;
        }

        if (state === "string" || state === "character") {
            if (current !== "\n" && current !== "\r") {
                chars[index] = " ";
            }
            if (escaped) {
                escaped = false;
            } else if (current === "\\") {
                escaped = true;
            } else if (
                (state === "string" && current === '"') ||
                (state === "character" && current === "'")
            ) {
                state = "normal";
            }
            continue;
        }

        if (current === "/" && next === "/") {
            chars[index] = " ";
            chars[index + 1] = " ";
            index += 1;
            state = "line";
        } else if (current === "/" && next === "*") {
            chars[index] = " ";
            chars[index + 1] = " ";
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
