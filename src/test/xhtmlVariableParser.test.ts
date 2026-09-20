import assert from "node:assert/strict";
import test from "node:test";
import { findElVariableAt, findElVariableScopes } from "../xhtmlVariableParser";

test("encuentra el tipo de una variable de p:dataTable", () => {
    const source = `
<p:dataTable var="item" value="#{administrarTicketsDM.lazyModelListaTickets}">
    <h:outputText value="#{item.tickets.showFactura}" />
</p:dataTable>`;
    const offset = source.indexOf("showFactura");
    const scope = findElVariableAt(findElVariableScopes(source), offset, "item");

    assert.ok(scope);
    assert.deepEqual(
        scope.binding.segments.map((segment) => segment.name),
        ["administrarTicketsDM", "lazyModelListaTickets"]
    );
});

test("respeta el alcance y la variable anidada más cercana", () => {
    const source = `
<ui:repeat var="item" value="#{bean.exteriores}">
    <ui:repeat var="item" value="#{bean.interiores}">
        #{item.nombre}
    </ui:repeat>
</ui:repeat>
#{item.fuera}`;
    const scopes = findElVariableScopes(source);
    const inside = findElVariableAt(scopes, source.indexOf("nombre"), "item");
    const outside = findElVariableAt(scopes, source.indexOf("fuera"), "item");

    assert.equal(inside?.binding.segments[1].name, "interiores");
    assert.equal(outside, undefined);
});

test("admite c:forEach con items y signos mayor dentro de atributos", () => {
    const source = `
<c:forEach var='fila' items='#{bean.filas}' rendered='#{bean.total > 0}'>
    #{fila.codigo}
</c:forEach>`;
    const scope = findElVariableAt(findElVariableScopes(source), source.indexOf("codigo"), "fila");

    assert.equal(scope?.binding.segments[1].name, "filas");
});
