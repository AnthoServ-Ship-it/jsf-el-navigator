import assert from "node:assert/strict";
import test from "node:test";
import { findPropertyKeySpans, parseResourceBundleDeclarations } from "../resourceBundleParser";

test("analiza el alias y base-name de un resource bundle JSF", () => {
    const source = `
        <faces-config>
            <application>
                <resource-bundle>
                    <base-name>EtiquetasResources</base-name>
                    <var>lbl</var>
                </resource-bundle>
            </application>
        </faces-config>
    `;
    const declarations = parseResourceBundleDeclarations(source);

    assert.equal(declarations.length, 1);
    assert.equal(declarations[0].variable, "lbl");
    assert.equal(declarations[0].baseName, "EtiquetasResources");
    assert.equal(
        source.slice(declarations[0].variableSpan.start, declarations[0].variableSpan.end),
        "lbl"
    );
});

test("encuentra una clave exacta en properties sin aceptar prefijos ni comentarios", () => {
    const source = `
# cierreCaja=ignorada
cierreCajaDetalle=Detalle
  cierreCaja = Cierre de caja
otra:valor
    `;
    const spans = findPropertyKeySpans(source, "cierreCaja");

    assert.equal(spans.length, 1);
    assert.equal(source.slice(spans[0].start, spans[0].end), "cierreCaja");
});
