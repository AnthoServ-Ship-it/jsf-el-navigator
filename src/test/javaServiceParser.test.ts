import assert from "node:assert/strict";
import test from "node:test";
import { findAllJavaServiceTargets, findJavaServiceTargetAt } from "../javaServiceParser";

const source = `
public class AdministrarTicketsController {
    @EJB(lookup = "java:global/manzanilla-service-1.0/FacadeTurnoServiceImpl!com.samasat.manzanilla.service.FacadeTurnoService")
    private FacadeTurnoService facadeTurnos;

    public void obtenerLosDestinos() {
        facadeTurnos.obtenerDestinosPorOrigenA(1L, 2L, ACTIVO);
    }
}`;

test("resuelve una llamada @EJB hacia la implementación indicada por lookup", () => {
    const offset = source.indexOf("obtenerDestinosPorOrigenA") + 5;
    const target = findJavaServiceTargetAt(source, offset);

    assert.ok(target);
    assert.equal(target.service.fieldName, "facadeTurnos");
    assert.equal(target.service.typeName, "FacadeTurnoService");
    assert.equal(target.service.implementationClass, "FacadeTurnoServiceImpl");
    assert.equal(target.service.interfaceName, "com.samasat.manzanilla.service.FacadeTurnoService");
    assert.equal(target.methodName, "obtenerDestinosPorOrigenA");
    assert.equal(target.argumentCount, 3);
    assert.deepEqual(target.argumentTypes, ["long", "long", undefined]);
});

test("cuenta argumentos anidados para seleccionar la sobrecarga exacta", () => {
    const nested = source.replace(
        "1L, 2L, ACTIVO",
        "cabecera.getEmpresa(1, 2), destino.getId(), EnumEstado.ACTIVO"
    );
    const target = findJavaServiceTargetAt(nested, nested.indexOf("obtenerDestinosPorOrigenA") + 5);

    assert.ok(target);
    assert.equal(target.argumentCount, 3);
});

test("solo crea enlaces para campos inyectados", () => {
    const withOrdinaryObject = `${source}\nobjeto.normal();\n// facadeTurnos.falso();`;
    const targets = findAllJavaServiceTargets(withOrdinaryObject);

    assert.deepEqual(
        targets.map((target) => target.methodName),
        ["obtenerDestinosPorOrigenA"]
    );
});
