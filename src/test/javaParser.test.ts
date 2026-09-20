import assert from "node:assert/strict";
import test from "node:test";
import { findJavaMembers, parseJavaBean } from "../javaParser";

test("analiza @ManagedBean con el formato usado por proyectos JSF clásicos", () => {
    const source = `
        package com.samasat.demo;

        import javax.faces.bean.ManagedBean;

        @ManagedBean(name = "administrarTicketsController")
        public class AdministrarTicketsController {
            private String nombre;

            public void obtenerTurnos() {
            }

            public String getNombre() {
                return nombre;
            }
        }
    `;

    const bean = parseJavaBean(source);
    assert.ok(bean);
    assert.deepEqual(bean.beanNames, ["administrarTicketsController"]);
    assert.equal(findJavaMembers(bean, "obtenerTurnos", true)[0]?.name, "obtenerTurnos");
    assert.equal(findJavaMembers(bean, "nombre", false)[0]?.name, "getNombre");
});

test("deduce el nombre de un bean CDI sin valor explícito", () => {
    const source = `
        import jakarta.inject.Named;

        @Named
        public class ClienteController {
            public void guardar() {}
        }
    `;

    const bean = parseJavaBean(source);
    assert.ok(bean);
    assert.deepEqual(bean.beanNames, ["clienteController"]);
});

test("los comentarios no crean beans ni métodos falsos", () => {
    const source = `
        // @Named("falso")
        @Named("real")
        public class RealController {
            // public void inexistente() {}
            public void guardar() {}
        }
    `;

    const bean = parseJavaBean(source);
    assert.ok(bean);
    assert.deepEqual(bean.beanNames, ["real"]);
    assert.equal(findJavaMembers(bean, "inexistente", true).length, 0);
});

test("puede indexar una clase por convención cuando se activa el respaldo", () => {
    const source = `
        public class ReporteController {
            public void generar() {}
        }
    `;

    assert.equal(parseJavaBean(source), undefined);
    const bean = parseJavaBean(source, true);
    assert.ok(bean);
    assert.deepEqual(bean.beanNames, ["reporteController"]);
    assert.equal(findJavaMembers(bean, "generar", true).length, 1);
});

test("registra la aridad de métodos sobrecargados", () => {
    const source = `
        public class TurnoDaoImpl {
            public void buscar(Long empresa, Long origen) {}
            public void buscar(Long empresa, Long origen, Long destino) {}
        }
    `;
    const bean = parseJavaBean(source, true);
    assert.ok(bean);

    assert.deepEqual(
        findJavaMembers(bean, "buscar", true).map((method) => method.parameterCount),
        [2, 3]
    );
    assert.deepEqual(
        findJavaMembers(bean, "buscar", true).map((method) => method.parameterTypes),
        [
            ["Long", "Long"],
            ["Long", "Long", "Long"]
        ]
    );
});

test("analiza herencia e interfaces de una implementación", () => {
    const source = `
        public class TurnoServiceImpl extends BaseService implements TurnoService, Serializable {
            public void guardar() {}
        }
    `;
    const bean = parseJavaBean(source, true);
    assert.ok(bean);
    assert.equal(bean.superClassName, "BaseService");
    assert.deepEqual(bean.interfaceNames, ["TurnoService", "Serializable"]);
});
