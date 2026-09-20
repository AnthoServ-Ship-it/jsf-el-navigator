/** Posición de un símbolo dentro del contenido de un archivo. */
export interface SourceSpan {
    start: number;
    end: number;
}

/** Tipo de miembro Java que puede exponerse mediante Expression Language. */
export type JavaMemberKind = "method" | "field";

/** Método o campo encontrado durante el análisis de una clase Java. */
export interface JavaMember {
    name: string;
    kind: JavaMemberKind;
    span: SourceSpan;
    returnType?: string;
    propertyName?: string;
    parameterCount?: number;
    parameterTypes?: string[];
}

/** Bean JSF/CDI descubierto en un archivo Java. */
export interface ParsedJavaBean {
    beanNames: string[];
    className: string;
    classSpan: SourceSpan;
    superClassName?: string;
    interfaceNames: string[];
    members: JavaMember[];
}

/** Segmento individual de una expresión como bean.metodo(). */
export interface ElSegment {
    name: string;
    start: number;
    end: number;
    invoked: boolean;
}

/** Referencia EL correspondiente a la posición actual del cursor. */
export interface ElTarget {
    expressionStart: number;
    expressionEnd: number;
    beanName: string;
    segments: ElSegment[];
    selectedIndex: number;
}
