# JSF EL Navigator

[Español](README.md) · [English](README.en.md)

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/anthoserv.jsf-el-navigator?label=Marketplace&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=anthoserv.jsf-el-navigator)
[![Instalaciones](https://img.shields.io/visual-studio-marketplace/i/anthoserv.jsf-el-navigator?label=instalaciones)](https://marketplace.visualstudio.com/items?itemName=anthoserv.jsf-el-navigator)
[![Calidad](https://github.com/AnthoServ-Ship-it/jsf-el-navigator/actions/workflows/ci.yml/badge.svg)](https://github.com/AnthoServ-Ship-it/jsf-el-navigator/actions/workflows/ci.yml)
[![Licencia MIT](https://img.shields.io/github/license/AnthoServ-Ship-it/jsf-el-navigator)](LICENSE)

Navegación para proyectos **Jakarta Faces/JSF y PrimeFaces** desde expresiones EL
en XHTML hacia Java, y desde controladores hacia servicios o DAO inyectados.

![Demostración XHTML, controlador y servicio](assets/demo.gif)

## Instalación

Busca `JSF EL Navigator` en la vista de extensiones de VS Code o ejecuta:

```bash
code --install-extension anthoserv.jsf-el-navigator
```

Después abre únicamente el proyecto o agregador Maven/Gradle en el que estás
trabajando. No es necesario indexar todos los proyectos del equipo.

## Recorrido principal

Mantén `Ctrl` (`Cmd` en macOS) y haz clic, o pulsa `F12`:

```text
vista.xhtml
    #{clienteController.guardar()}
                    ↓
ClienteController.guardar()
    clienteService.guardar(nombre)
                    ↓
ClienteServiceImpl.guardar(String)
```

La extensión funciona en cualquier atributo que contenga EL; no depende de una
versión específica de PrimeFaces:

```xhtml
<p:commandButton actionListener="#{clienteController.guardar()}" />
<p:ajax listener="#{clienteController.actualizar}" />
<p:autoComplete completeMethod="#{clienteController.buscar}" />
<p:dataTable value="#{clienteController.clientes}" />
```

## Funcionalidad

- `F12` o `Ctrl+clic` sobre `#{bean.metodo}`, propiedades y expresiones encadenadas.
- Beans declarados con `@ManagedBean`, `@Named`, `@Controller` o `@Component`.
- Resolución hacia métodos, getters `get...()`/`is...()` y campos Java.
- Navegación controlador → servicio → DAO para `@EJB`, `@Inject`, `@Autowired`
  y `@Resource`, incluida la inyección por constructor.
- Selección de implementación cuando una interfaz tiene varios candidatos.
- Selección de sobrecargas por cantidad y tipos inferidos de argumentos.
- Métodos heredados y módulos hermanos dentro del agregador Maven o Gradle.
- Vista previa, autocompletado y diagnósticos para referencias inexistentes.
- `Shift+F12` para buscar usos XHTML y llamadas a servicios inyectados.
- Índice en memoria independiente por módulo, con invalidación automática.
- Procesamiento completamente local, sin telemetría ni envío de código fuente.

## Probar con un ejemplo

Abre [examples/jsf-primefaces-demo](examples/jsf-primefaces-demo) como carpeta de
VS Code. El ejemplo reproduce el recorrido completo:

```text
clientes.xhtml → ClienteController → ClienteServiceImpl
```

Consulta las [instrucciones del proyecto demostrativo](examples/jsf-primefaces-demo/README.md).

## Diseño para proyectos grandes

Cuando una carpeta contiene muchos proyectos, diferentes módulos pueden declarar
el mismo nombre de bean. La extensión localiza el `pom.xml`, `build.gradle` o
`build.gradle.kts` más cercano al XHTML y solo indexa su `src/main/java`.

Para llamadas Java, busca implementaciones únicamente dentro del agregador al que
pertenece el módulo. Un `lookup` de `@EJB` tiene prioridad; después se utilizan la
convención `InterfazImpl`, los calificadores y las relaciones `implements`.

## Comandos

Abre la paleta con `Ctrl+Shift+P`:

- `JSF EL Navigator: Ir a la definición Java`.
- `JSF EL Navigator: Ir a la implementación del servicio`.
- `JSF EL Navigator: Reconstruir índice Java`.
- `JSF EL Navigator: Mostrar diagnóstico del índice`.

## Configuración

```json
{
    "jsfElNavigator.enabled": true,
    "jsfElNavigator.javaServiceNavigation.enabled": true,
    "jsfElNavigator.diagnostics.enabled": true,
    "jsfElNavigator.logging": "info",
    "jsfElNavigator.additionalJavaSourceRoots": ["../modulo-compartido/src/main/java"]
}
```

Las rutas adicionales pueden ser absolutas o relativas al módulo del XHTML.

## Desarrollo

Requisitos: Node.js 18.19 o posterior y Visual Studio Code 1.85 o posterior.

```bash
npm ci
npm run validate
npm run test:integration
npm run package
```

Pulsa `F5` para abrir un Extension Development Host. El empaquetado genera
`jsf-el-navigator-<versión>.vsix`.

## Ingeniería Anthoserv

- TypeScript estricto, ESLint, Prettier y pruebas automatizadas.
- Validación en Linux, Windows y macOS mediante GitHub Actions.
- Publicación reproducible mediante etiquetas de versión.
- Arquitectura documentada en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Estilo del autor en [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md).
- Proceso de publicación en [docs/PUBLISHING.md](docs/PUBLISHING.md).

Los problemas y propuestas se reciben en [GitHub Issues](https://github.com/AnthoServ-Ship-it/jsf-el-navigator/issues).
Consulta [SECURITY.md](SECURITY.md) para reportes privados de seguridad.

## Licencia y autor

MIT © 2026 **anthoserv**
