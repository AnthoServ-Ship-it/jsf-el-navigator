# JSF EL Navigator

Extensión de Visual Studio Code para navegar desde expresiones Jakarta Faces/JSF y PrimeFaces en archivos XHTML hacia beans, métodos y propiedades Java.

Autor: **anthoserv**

## Funcionalidad

- `F12` o `Ctrl+clic` sobre `#{bean.metodo}` y `#{bean.metodo()}`.
- Navegación hacia beans declarados con `@ManagedBean`, `@Named`, `@Controller` o `@Component`.
- Resolución de propiedades hacia getters `get...()`, `is...()` o campos Java.
- Soporte para expresiones de método con y sin paréntesis.
- Índice en memoria independiente por módulo Maven o Gradle.
- Invalidación automática del índice cuando cambia un archivo Java.
- Exclusión de `target`, `build`, `node_modules` y `.git`.
- `Ctrl+clic` desde llamadas Java de un controlador hacia métodos de servicios
  inyectados con `@EJB`, `@Inject` o `@Autowired`.
- Selección de sobrecargas por cantidad y tipos de argumentos.
- Navegación de expresiones encadenadas, por ejemplo
  `#{gastosCajaDM.gastosCaja.nombreUsuario}`.
- Vista previa de la firma y el archivo destino al pasar el cursor.
- Autocompletado de beans, métodos y propiedades dentro de `#{...}`.
- Diagnósticos para beans y miembros Java inexistentes.
- `Shift+F12`/`Buscar todas las referencias` desde Java hacia usos XHTML y
  llamadas de servicios inyectados.

La navegación funciona en cualquier atributo que contenga EL; no depende de una versión específica de PrimeFaces:

```xhtml
<p:commandButton actionListener="#{clienteController.guardar()}" />
<p:ajax listener="#{clienteController.actualizar}" />
<p:autoComplete completeMethod="#{clienteController.buscar}" />
<p:dataTable value="#{clienteController.clientes}" />
```

```java
@ManagedBean(name = "clienteController")
@ViewScoped
public class ClienteController implements Serializable {

    public void guardar() {
    }

    public void actualizar() {
    }

    public List<Cliente> buscar(String texto) {
        return Collections.emptyList();
    }

    public List<Cliente> getClientes() {
        return clientes;
    }
}
```

## Diseño para proyectos grandes

Cuando Visual Studio Code abre una carpeta que contiene muchos proyectos, diferentes módulos pueden declarar el mismo nombre de bean. La extensión localiza el `pom.xml`, `build.gradle` o `build.gradle.kts` más cercano al XHTML y solo indexa su `src/main/java`.

Así se evita que una vista de `manzanilla-web` navegue por error hacia una clase homónima de `sitti-web` o `sittiCourier-web`.

Para llamadas Java, la extensión lee el `lookup` de `@EJB` y busca la
implementación únicamente dentro del agregador Maven al que pertenece el
módulo. Por ejemplo, desde:

```java
facadeTurnos.obtenerDestinosPorOrigenA(...);
```

abre directamente `FacadeTurnoServiceImpl.obtenerDestinosPorOrigenA(...)` en
el módulo hermano `manzanilla-service`.

Si el servicio llama a un DAO con métodos sobrecargados, se comparan tanto la
cantidad como los tipos inferidos de los argumentos para abrir una sola
implementación. También se recorren clases base cuando el método es heredado.

## Comandos

Abre la paleta con `Ctrl+Shift+P`:

- `JSF EL Navigator: Reconstruir índice Java` limpia y reconstruye el módulo activo.
- `JSF EL Navigator: Mostrar diagnóstico del índice` abre el canal de salida con los módulos, archivos y beans indexados.
- `JSF EL Navigator: Ir a la definición Java` navega directamente y evita interferencias de otros proveedores.

En archivos `.xhtml`, `F12` ejecuta directamente el comando de la extensión. La
misma acción está disponible haciendo clic derecho dentro del editor. Desde la
versión 0.1.5, las referencias EL también se publican como enlaces propios para
que `Ctrl+clic` no dependa de otros proveedores HTML instalados.

## Configuración

```json
{
    "jsfElNavigator.enabled": true,
    "jsfElNavigator.logging": "info",
    "jsfElNavigator.additionalJavaSourceRoots": ["../modulo-compartido/src/main/java"]
}
```

Las rutas adicionales pueden ser absolutas o relativas al módulo que contiene el XHTML.

## Desarrollo

Requisitos:

- Node.js 18.19 o posterior para compilar y validar.
- Node.js 20 o posterior recomendado para empaquetar con VSCE.
- Visual Studio Code 1.85 o posterior.

Instala las dependencias y verifica el proyecto:

```bash
npm ci
npm run validate
```

Pulsa `F5` en Visual Studio Code para abrir un Extension Development Host.

La prueba de integración abre una instancia aislada de VS Code y comprueba la
navegación XHTML → controlador → servicio:

```bash
npm run test:integration
```

## Generar el instalador

```bash
npm run package
```

El empaquetador requiere Node.js 20. Si el Node del sistema es anterior, el
script intenta utilizar automáticamente el runtime moderno incluido en VS Code.

El comando genera un archivo parecido a:

```text
jsf-el-navigator-0.3.0.vsix
```

Para instalarlo abre la paleta de comandos y selecciona `Extensions: Install from VSIX...`.

## Ingeniería y privacidad

- El código se valida con TypeScript estricto, ESLint, Prettier y pruebas automáticas.
- GitHub Actions comprueba cada cambio y genera un VSIX instalable.
- Todo el análisis ocurre localmente; la extensión no recopila telemetría ni envía
  código fuente a servicios externos.
- La arquitectura está documentada en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- El estilo de ingeniería Anthoserv está definido en
  [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md).
- Las instrucciones de publicación se encuentran en
  [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Contribuciones y seguridad

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para preparar cambios y
[SECURITY.md](SECURITY.md) para reportar vulnerabilidades de manera responsable.

## Licencia

MIT © 2026 anthoserv
