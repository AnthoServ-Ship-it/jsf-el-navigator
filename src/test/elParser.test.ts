import assert from "node:assert/strict";
import test from "node:test";
import { findAllElTargets, findElTargetAt } from "../elParser";

test("detecta un método JSF con paréntesis", () => {
    const source = '<p:ajax listener="#{administrarTicketsController.obtenerTurnos()}" />';
    const offset = source.indexOf("obtenerTurnos") + 4;
    const target = findElTargetAt(source, offset);

    assert.ok(target);
    assert.equal(target.beanName, "administrarTicketsController");
    assert.equal(target.selectedIndex, 1);
    assert.equal(target.segments[1].name, "obtenerTurnos");
    assert.equal(target.segments[1].invoked, true);
});

test("detecta una propiedad sin paréntesis", () => {
    const source = 'value="#{clienteController.clientes}"';
    const offset = source.indexOf("clientes") + 2;
    const target = findElTargetAt(source, offset);

    assert.ok(target);
    assert.equal(target.segments[1].name, "clientes");
    assert.equal(target.segments[1].invoked, false);
});

test("ignora posiciones fuera de Expression Language", () => {
    const source = '<p:commandButton value="Guardar" />';
    assert.equal(findElTargetAt(source, source.indexOf("Guardar")), undefined);
});

test("enumera los segmentos que deben responder a Ctrl+clic", () => {
    const source = [
        'listener="#{administrarTicketsController.obtenerTurnos() }"',
        'value="#{administrarTicketsController.sucursalesItems}"'
    ].join("\n");

    const names = findAllElTargets(source).map(
        (target) => target.segments[target.selectedIndex].name
    );

    assert.deepEqual(names, [
        "administrarTicketsController",
        "obtenerTurnos",
        "administrarTicketsController",
        "sucursalesItems"
    ]);
});

test("no crea enlaces para parámetros de texto ni palabras reservadas", () => {
    const source = "value=\"#{empty bean.buscar('texto')}\"";
    const names = findAllElTargets(source).map(
        (target) => target.segments[target.selectedIndex].name
    );

    assert.deepEqual(names, ["bean", "buscar"]);
});

test("enumera todos los niveles de una expresión EL encadenada", () => {
    const source = 'value="#{gastosCajaDM.gastosCaja.nombreUsuario}"';
    const targets = findAllElTargets(source);

    assert.deepEqual(
        targets.map((target) => ({
            name: target.segments[target.selectedIndex].name,
            level: target.selectedIndex
        })),
        [
            { name: "gastosCajaDM", level: 0 },
            { name: "gastosCaja", level: 1 },
            { name: "nombreUsuario", level: 2 }
        ]
    );
});
