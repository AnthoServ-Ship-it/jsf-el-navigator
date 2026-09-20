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

test("reconoce servicios inyectados con @Resource", () => {
    const resourceSource = `
public class ReporteController {
    @Resource(name = "reporteService")
    private ReporteService servicio;

    public void generar() {
        servicio.generar();
    }
}`;
    const target = findJavaServiceTargetAt(
        resourceSource,
        resourceSource.indexOf("generar();") + 2
    );

    assert.ok(target);
    assert.equal(target.service.typeName, "ReporteService");
    assert.equal(target.service.qualifier, "reporteService");
    assert.equal(target.methodName, "generar");
});

test("reconoce inyección por constructor con @Inject", () => {
    const constructorSource = `
public class ClienteController {
    private final ClienteService servicio;

    @Inject
    public ClienteController(ClienteService clienteService) {
        this.servicio = clienteService;
    }

    public void guardar() {
        servicio.guardar("Anthoserv");
    }
}`;
    const target = findJavaServiceTargetAt(
        constructorSource,
        constructorSource.lastIndexOf("guardar") + 2
    );

    assert.ok(target);
    assert.equal(target.service.fieldName, "servicio");
    assert.equal(target.service.typeName, "ClienteService");
    assert.equal(target.methodName, "guardar");
});

test("conserva @Qualifier en parámetros de constructor Spring", () => {
    const constructorSource = `
public class PagoController {
    private final PagoService servicio;

    @Autowired
    public PagoController(@Qualifier("pagoInternacional") PagoService servicio) {
        this.servicio = servicio;
    }

    public void pagar() {
        servicio.procesar();
    }
}`;
    const target = findJavaServiceTargetAt(
        constructorSource,
        constructorSource.indexOf("procesar") + 2
    );

    assert.ok(target);
    assert.equal(target.service.qualifier, "pagoInternacional");
    assert.equal(target.service.typeName, "PagoService");
});

test("infiere variables en una sola pasada para seleccionar sobrecargas", () => {
    const variableSource = `
public class ClienteController {
    @Inject
    private ClienteService servicio;

    public void buscar() {
        String identificacion = "0102030405";
        servicio.buscar(identificacion);
    }
}`;
    const target = findJavaServiceTargetAt(
        variableSource,
        variableSource.lastIndexOf("buscar") + 2
    );

    assert.ok(target);
    assert.deepEqual(target.argumentTypes, ["String"]);
});
