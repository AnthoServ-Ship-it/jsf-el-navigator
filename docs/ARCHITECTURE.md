# Arquitectura

JSF EL Navigator utiliza proveedores nativos de Visual Studio Code y analizadores
ligeros para ofrecer navegación inmediata sin iniciar un servidor Java adicional.

## Flujo XHTML hacia Java

```text
Documento XHTML
    -> elParser
    -> BeanIndex por módulo
    -> javaParser
    -> DefinitionProvider / DocumentLinkProvider
    -> clase, método, getter o campo Java
```

`moduleResolver` localiza el módulo Maven o Gradle más cercano. `BeanIndex` lee sus
raíces Java en lotes, conserva el resultado en memoria e invalida el módulo cuando
cambia un archivo de `src/main/java`.

## Flujo Java hacia servicios

```text
Controlador Java
    -> javaServiceParser
    -> moduleResolver encuentra el agregador
    -> JavaServiceDefinitionProvider
    -> implementación concreta / clase base / interfaz
```

El parser identifica campos inyectados mediante `@EJB`, `@Inject` o `@Autowired`.
Cuando existe un `lookup` EJB, la implementación indicada tiene prioridad. Las
sobrecargas se comparan mediante cantidad y tipos inferidos de los argumentos.

## Componentes

- `elParser.ts`: localiza expresiones EL y sus segmentos navegables.
- `javaParser.ts`: extrae beans, relaciones de clase y miembros públicos.
- `beanIndex.ts`: administra índices independientes por módulo.
- `moduleResolver.ts`: delimita módulos y agregadores Maven/Gradle.
- `definitionProvider.ts`: resuelve XHTML hacia Java.
- `javaServiceDefinitionProvider.ts`: resuelve controladores hacia servicios y DAO.
- `documentLinkProvider.ts`: garantiza `Ctrl+clic` frente a otros proveedores HTML.
- `completionProvider.ts`, `hoverProvider.ts`, `diagnostics.ts`: experiencia del editor.
- `referenceProvider.ts`: busca usos XHTML y llamadas Java.

## Decisiones de diseño

- El análisis se limita al proyecto actual para evitar referencias homónimas.
- Los parsers preservan offsets UTF-16 compatibles con `TextDocument`.
- Las búsquedas compartidas no se cancelan por movimientos pasajeros del cursor.
- Los proveedores nunca modifican el código del usuario.
- La extensión no recopila telemetría ni transmite archivos.

## Límites conocidos

Los analizadores son deliberadamente ligeros y no reemplazan el compilador Java.
Las construcciones sintácticas poco habituales deben incorporarse mediante casos de
prueba antes de ampliar las expresiones reconocidas.
