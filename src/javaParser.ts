import { type JavaMember, type ParsedJavaBean } from "./types";

const BEAN_ANNOTATION =
    /@(?:(?:javax|jakarta|org\.springframework)\.[A-Za-z0-9_.]+\.)?(Named|ManagedBean|Controller|Component)\b(?:\s*\(([\s\S]*?)\))?/g;
const CLASS_DECLARATION =
    /\b(?:public\s+)?(?:(?:abstract|final)\s+)*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const CLASS_RELATIONS =
    /\bclass\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\s+extends\s+([A-Za-z_$][A-Za-z0-9_$.]*))?(?:\s+implements\s+([^{]+))?\s*\{/;
const METHOD_DECLARATION =
    /\bpublic\s+(?:(?:static|final|synchronized|abstract|native|default|strictfp)\s+)*(?:<[^>{};]+>\s+)?([A-Za-z_$][A-Za-z0-9_$.[\]<>?, \t]*)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const FIELD_DECLARATION =
    /\b(?:private|protected|public)\s+(?:(?:static|final|transient|volatile)\s+)*([A-Za-z_$][A-Za-z0-9_$.[\]<>?, \t]*)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=|;)/g;

/**
 * Analizador deliberadamente ligero para controladores JSF convencionales.
 * Conserva los offsets originales para que VS Code pueda abrir la línea exacta.
 */
export function parseJavaBean(
    source: string,
    includeImplicitClass = false
): ParsedJavaBean | undefined {
    const cleanSource = maskComments(source);
    const classMatch = CLASS_DECLARATION.exec(cleanSource);

    if (!classMatch) {
        return undefined;
    }

    const className = classMatch[1];
    const classNameOffset = classMatch.index + classMatch[0].lastIndexOf(className);
    const annotationsArea = cleanSource.slice(0, classMatch.index);
    const declaredBeanNames = extractBeanNames(annotationsArea, className);
    const beanNames =
        declaredBeanNames.length > 0
            ? declaredBeanNames
            : includeImplicitClass
              ? [decapitalize(className)]
              : [];

    if (beanNames.length === 0) {
        return undefined;
    }

    const relations = CLASS_RELATIONS.exec(cleanSource);

    return {
        beanNames,
        className,
        classSpan: {
            start: classNameOffset,
            end: classNameOffset + className.length
        },
        superClassName: relations?.[1],
        interfaceNames: relations?.[2]
            ? relations[2]
                  .split(",")
                  .map((name) => name.trim())
                  .filter(Boolean)
            : [],
        members: [...extractMethods(cleanSource), ...extractFields(cleanSource)]
    };
}

/**
 * Devuelve los miembros candidatos según las reglas de JavaBeans/EL.
 * Una llamada con paréntesis solo acepta métodos; una propiedad prioriza getters.
 */
export function findJavaMembers(
    bean: ParsedJavaBean,
    requestedName: string,
    invoked: boolean
): JavaMember[] {
    const methods = bean.members.filter(
        (member) => member.kind === "method" && member.name === requestedName
    );

    if (invoked) {
        return methods;
    }

    const getters = bean.members.filter(
        (member) => member.kind === "method" && member.propertyName === requestedName
    );
    if (getters.length > 0) {
        return getters;
    }

    const fields = bean.members.filter(
        (member) => member.kind === "field" && member.name === requestedName
    );
    if (fields.length > 0) {
        return fields;
    }

    // JSF permite expresiones de método sin paréntesis: #{bean.guardar}.
    return methods;
}

function extractBeanNames(annotationsArea: string, className: string): string[] {
    const names = new Set<string>();
    BEAN_ANNOTATION.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = BEAN_ANNOTATION.exec(annotationsArea)) !== null) {
        const argumentsText = match[2];
        const explicitName = argumentsText
            ? /(?:\b(?:name|value)\s*=\s*)?"([A-Za-z_$][A-Za-z0-9_$.-]*)"/.exec(argumentsText)?.[1]
            : undefined;

        names.add(explicitName ?? decapitalize(className));
    }

    return [...names];
}

function extractMethods(source: string): JavaMember[] {
    const members: JavaMember[] = [];
    METHOD_DECLARATION.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = METHOD_DECLARATION.exec(source)) !== null) {
        const returnType = match[1].trim();
        const name = match[2];
        const start = match.index + match[0].lastIndexOf(name);
        const openParenthesis = match.index + match[0].lastIndexOf("(");
        const closeParenthesis = findClosingParenthesis(source, openParenthesis);
        const parameterCount =
            closeParenthesis >= 0
                ? countParameters(source.slice(openParenthesis + 1, closeParenthesis))
                : undefined;
        const parameterTypes =
            closeParenthesis >= 0
                ? extractParameterTypes(source.slice(openParenthesis + 1, closeParenthesis))
                : undefined;

        members.push({
            name,
            kind: "method",
            returnType,
            parameterCount,
            parameterTypes,
            propertyName: propertyNameFromAccessor(name),
            span: {
                start,
                end: start + name.length
            }
        });
    }

    return members;
}

function extractParameterTypes(parameters: string): string[] {
    if (parameters.trim().length === 0) {
        return [];
    }

    return splitTopLevel(parameters).map((parameter) => {
        const withoutAnnotations = parameter
            .replace(/@[A-Za-z_$][A-Za-z0-9_$.]*(?:\s*\([^)]*\))?\s*/g, "")
            .replace(/\bfinal\s+/g, "")
            .trim();
        const declaration = /^(.*?)(?:\s+|\.\.\.\s*)([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(
            withoutAnnotations
        );
        return normalizeType(declaration?.[1] ?? withoutAnnotations);
    });
}

function splitTopLevel(value: string): string[] {
    const values: string[] = [];
    let start = 0;
    let angle = 0;
    let parentheses = 0;
    let brackets = 0;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === "<") angle += 1;
        else if (character === ">") angle = Math.max(0, angle - 1);
        else if (character === "(") parentheses += 1;
        else if (character === ")") parentheses -= 1;
        else if (character === "[") brackets += 1;
        else if (character === "]") brackets -= 1;
        else if (character === "," && angle === 0 && parentheses === 0 && brackets === 0) {
            values.push(value.slice(start, index).trim());
            start = index + 1;
        }
    }
    values.push(value.slice(start).trim());
    return values;
}

function normalizeType(typeName: string): string {
    const withoutGenerics = typeName
        .replace(/<.*>/, "")
        .replace(/\.\.\./g, "[]")
        .trim();
    const arraySuffix = withoutGenerics.endsWith("[]") ? "[]" : "";
    const base = arraySuffix ? withoutGenerics.slice(0, -2).trim() : withoutGenerics;
    return base.slice(base.lastIndexOf(".") + 1) + arraySuffix;
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

function countParameters(parameters: string): number {
    if (parameters.trim().length === 0) {
        return 0;
    }

    let count = 1;
    let angleBrackets = 0;
    let parentheses = 0;
    let brackets = 0;
    for (const character of parameters) {
        if (character === "<") {
            angleBrackets += 1;
        } else if (character === ">") {
            angleBrackets = Math.max(0, angleBrackets - 1);
        } else if (character === "(") {
            parentheses += 1;
        } else if (character === ")") {
            parentheses -= 1;
        } else if (character === "[") {
            brackets += 1;
        } else if (character === "]") {
            brackets -= 1;
        } else if (
            character === "," &&
            angleBrackets === 0 &&
            parentheses === 0 &&
            brackets === 0
        ) {
            count += 1;
        }
    }
    return count;
}

function extractFields(source: string): JavaMember[] {
    const members: JavaMember[] = [];
    FIELD_DECLARATION.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = FIELD_DECLARATION.exec(source)) !== null) {
        const name = match[2];
        const start = match.index + match[0].lastIndexOf(name);

        members.push({
            name,
            kind: "field",
            returnType: match[1].trim(),
            span: {
                start,
                end: start + name.length
            }
        });
    }

    return members;
}

function propertyNameFromAccessor(methodName: string): string | undefined {
    if (methodName.startsWith("get") && methodName.length > 3) {
        return decapitalize(methodName.slice(3));
    }
    if (methodName.startsWith("is") && methodName.length > 2) {
        return decapitalize(methodName.slice(2));
    }
    return undefined;
}

/** Aplica la misma regla de nombres implícitos usada por java.beans.Introspector. */
function decapitalize(value: string): string {
    if (value.length > 1 && isUpperCase(value[0]) && isUpperCase(value[1])) {
        return value;
    }
    return value.charAt(0).toLowerCase() + value.slice(1);
}

function isUpperCase(character: string): boolean {
    return character === character.toUpperCase() && character !== character.toLowerCase();
}

/**
 * Sustituye comentarios por espacios sin alterar la longitud ni los saltos de línea.
 * Las cadenas se conservan porque pueden contener el nombre explícito del bean.
 */
function maskComments(source: string): string {
    // split("") conserva unidades UTF-16, que son las mismas usadas por los
    // offsets de TextDocument y RegExp en VS Code.
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
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current === "\\") {
                escaped = true;
                continue;
            }
            if (
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
            state = "string";
        } else if (current === "'") {
            state = "character";
        }
    }

    return chars.join("");
}
