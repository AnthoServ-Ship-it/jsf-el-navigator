import assert from "node:assert/strict";
import test from "node:test";
import { findJavaLocalMethodTargetAt } from "../javaLocalMethodParser";
import { parseJavaBean } from "../javaParser";

test("encuentra llamadas a métodos locales de un controller", () => {
    const source = `
        public class AdministrarTicketsController {
            public void initForm() {
                obtenerOrigenes();
                this.obtenerSucursales(empresa, calcular(1, 2));
                servicio.obtenerOrigenes();
            }
            public void obtenerOrigenes() {}
            public void obtenerSucursales(Long empresa, Object valor) {}
            public Object calcular(int uno, int dos) { return null; }
        }
    `;
    const parsed = parseJavaBean(source, true);
    assert.ok(parsed);

    const origenes = findJavaLocalMethodTargetAt(
        source,
        source.indexOf("obtenerOrigenes();") + 3,
        parsed.members
    );
    const sucursales = findJavaLocalMethodTargetAt(
        source,
        source.indexOf("this.obtenerSucursales") + "this.".length + 3,
        parsed.members
    );
    const servicio = findJavaLocalMethodTargetAt(
        source,
        source.indexOf("servicio.obtenerOrigenes") + "servicio.".length + 3,
        parsed.members
    );

    assert.deepEqual([origenes?.methodName, origenes?.argumentCount], ["obtenerOrigenes", 0]);
    assert.deepEqual([sucursales?.methodName, sucursales?.argumentCount], ["obtenerSucursales", 2]);
    assert.equal(servicio, undefined);
});

test("ignora la declaración del método", () => {
    const source = `
        public class Controller {
            public void iniciar() {
                // cargar();
                String texto = "cargar()";
            }
            public void cargar() {}
        }
    `;
    const parsed = parseJavaBean(source, true);
    assert.ok(parsed);
    const declaration = source.lastIndexOf("cargar()") + 2;
    assert.equal(findJavaLocalMethodTargetAt(source, declaration, parsed.members), undefined);
});

test("navega llamadas locales hacia métodos privados", () => {
    const source = `
        public class CajaController {
            public void iniciar() {
                buscarSupervisor();
            }

            private void buscarSupervisor() throws EntidadNoEncontradaException {
            }
        }
    `;
    const parsed = parseJavaBean(source, true);
    assert.ok(parsed);

    const call = source.indexOf("buscarSupervisor();") + 4;
    const target = findJavaLocalMethodTargetAt(source, call, parsed.members);
    assert.deepEqual([target?.methodName, target?.argumentCount], ["buscarSupervisor", 0]);
    assert.equal(
        parsed.members.some(
            (member) => member.kind === "method" && member.name === "buscarSupervisor"
        ),
        true
    );
});
