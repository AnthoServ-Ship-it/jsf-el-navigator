import assert from "node:assert/strict";
import test from "node:test";
import { parseJavaMethodDocumentation } from "../javaDocumentationParser";

test("extrae la firma, clase y JavaDoc completo de un método", () => {
    const source = `
package com.samasat.ventas;

public class CierreCajaServiceImpl {
    /**
     * Conserva la firma historica para los demas sistemas que contabilizan el
     * cierre de caja.
     *
     * @param usuario identificador del cajero
     * @param cierreForzado indica si el cierre es manual
     * @return el cierre generado
     * @throws EntidadNoEncontradaException cuando no existe la caja
     */
    public TvenAperturaCierreCaja cerrarSesionOCCTransportes(
        Long usuario,
        boolean cierreForzado
    ) throws EntidadNoEncontradaException {
        return null;
    }
}
`;
    const offset = source.indexOf("cerrarSesionOCCTransportes");
    const method = parseJavaMethodDocumentation(source, offset);

    assert.ok(method);
    assert.equal(method.name, "cerrarSesionOCCTransportes");
    assert.equal(method.owner, "com.samasat.ventas.CierreCajaServiceImpl");
    assert.match(method.signature, /^public TvenAperturaCierreCaja cerrarSesionOCCTransportes\(/);
    assert.match(method.signature, /throws EntidadNoEncontradaException$/);
    assert.match(method.documentation ?? "", /Conserva la firma historica/);
    assert.match(method.documentation ?? "", /Parámetro usuario: identificador del cajero/);
    assert.match(method.documentation ?? "", /Retorna: el cierre generado/);
    assert.match(method.documentation ?? "", /Excepción EntidadNoEncontradaException/);
});

test("muestra la firma aunque el método no tenga JavaDoc", () => {
    const source = "class Controlador { private void buscarSupervisor() {} }";
    const method = parseJavaMethodDocumentation(source, source.indexOf("buscarSupervisor"));

    assert.ok(method);
    assert.equal(method.owner, "Controlador");
    assert.equal(method.signature, "private void buscarSupervisor()");
    assert.equal(method.documentation, undefined);
});
