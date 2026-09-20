# Registro de cambios

## 0.4.20

- Compatibilidad de la prueba de integración con VS Code 1.85, que no serializa el texto del enlace resuelto.
- Se conserva completa la documentación de métodos al mantener `Ctrl` en versiones actuales de VS Code.

## 0.4.19

- Al mantener `Ctrl` sobre un método, la ayuda del enlace muestra la clase propietaria, la firma, el JavaDoc y la ubicación.
- Se presentan también las etiquetas `@param`, `@return`, `@throws` y `@exception`.
- La documentación se obtiene únicamente para el enlace seleccionado y queda en caché por versión del archivo.

## 0.4.18

- Se retira el listado automático de claves de resource bundles para mantener inmediata la respuesta del editor.
- `lbl.` ya no inicia la búsqueda de beans Java ni recorre las claves del archivo `.properties`.
- Se conserva la navegación directa desde `#{lbl.clave}` hacia su definición.

## 0.4.17

- Autocompletado inmediato de claves al escribir alias de resource bundle como `#{lbl.}`.
- El listado muestra el valor legible de cada clave y elimina duplicados.
- Las claves se leen una vez por archivo y permanecen en caché hasta guardar el `.properties`.

## 0.4.16

- `Ctrl+clic` y `F12` sobre expresiones como `#{lbl.cierreCaja}` abren la clave exacta del resource bundle `.properties`.
- Navegación sobre el alias `lbl` hacia su declaración en `faces-config.xml`.
- Resolución limitada al módulo XHTML actual, bajo demanda y con caché invalidada únicamente al guardar configuración o propiedades.

## 0.4.15

- La navegación hacia servicios de otro proyecto se actualiza al agregar o quitar carpetas del workspace.
- Se invalidan únicamente las rutas en caché y se regeneran los enlaces abiertos, sin reconstruir índices ni recorrer proyectos en segundo plano.

## 0.4.14

- `Ctrl+clic` y `F12` navegan desde llamadas locales hacia métodos `private`, `protected` y sin modificador.
- Los métodos no públicos se conservan fuera de la resolución XHTML/EL.
- Resolución local por archivo y caché, sin búsquedas adicionales en el workspace.

## 0.4.13

- Navegación directa completa: XHTML → bean/controlador → servicio → implementación e implementación → interfaz.
- `Ctrl+clic` directo en clases y entidades Java, incluidos proyectos hermanos del workspace.
- Resolución bajo demanda con caché; no se recorre el workspace al iniciar ni al pasar el mouse.
- Pruebas reales con `ChoferesController`, `FacadeChoferesServiceImpl`, `TgenEntidadesServicesImpl` y `TgenCorreo`.

## 0.4.12

- `Ctrl+clic` en métodos locales abre directamente el archivo y la línea, sin URI de comando ni espera del servidor Java.
- Se eliminan el comando intermedio agregado en 0.4.11 y la captura global de `F12` en Java para recuperar el comportamiento normal del editor.

## 0.4.11

- `Ctrl+clic` en métodos locales usa un enlace directo y evita el proveedor cancelado de Red Hat Java.
- Enlaces locales calculados una sola vez por versión del archivo y reutilizados desde caché.

## 0.4.10

- Activación inmediata y ligera al abrir Java para que `Ctrl+clic` y `F12` siempre estén disponibles.
- Caso real verificado: `validarExistenteCorreo(choferesDM.getCorreos())` navega a su declaración.

## 0.4.9

- Navegación directa a tipos Java importados, incluidos usos como `MonHistorialPoints.class`.
- Búsqueda dirigida por paquete y caché de rutas, sin indexar el proyecto en segundo plano.

## 0.4.8

- Restaura `F12` y `Ctrl+clic` en llamadas a métodos locales del mismo controller.
- Selecciona sobrecargas locales por cantidad de argumentos.
- Resuelve únicamente la palabra pulsada y deja los diagnósticos de fondo desactivados por defecto.

## 0.4.7

- Navegación desde variables locales declaradas con `var` en tablas y repeticiones XHTML.
- Inferencia del elemento de `List<T>`, `LazyDataModel<T>` y arreglos sin análisis permanente.
- Soporte de cadenas como `#{item.tickets.showFactura}` con caché por versión del documento.

## 0.4.6

- Navegación bidireccional entre métodos de interfaces y sus implementaciones.
- `F12` y `Ctrl+clic` sobre métodos `@Override` regresan a la declaración de la interfaz.
- Búsqueda inversa directa por nombre de interfaz y caché por clase de implementación.

## 0.4.5

- Navegación desde interfaces hacia implementaciones con nombres no convencionales.
- Reconocimiento de clases que combinan `extends` genérico e `implements`.
- Separación correcta de varias interfaces con parámetros genéricos.

## 0.4.4

- `F12` en interfaces Java abre directamente la implementación y evita la definición duplicada del servidor Java.
- `Ctrl+clic` usa un enlace directo sobre cada método de interfaz.
- La navegación Java normal se conserva como respaldo para símbolos que no maneja la extensión.
- Caché estructural por documento y versión para no repetir el análisis de interfaces.

## 0.4.3

- Navegación con `F12` o `Ctrl+clic` desde métodos de interfaces Java hacia su implementación.
- Soporte de `Ctrl+F12` para buscar implementaciones de interfaces de servicio.
- `Shift+F12` encuentra llamadas a métodos declarados en interfaces Java.
- Selección exacta de sobrecargas mediante cantidad y tipos de parámetros.
- Resolución bajo demanda para conservar un consumo mínimo en reposo.

## 0.4.2

- Registro desactivado por defecto para mantener el canal de salida limpio.
- Las resoluciones iniciadas por hover solo se muestran con nivel `debug`.
- Se elimina el mensaje repetitivo cuando el cursor no apunta a una referencia EL.

## 0.4.1

- Análisis XHTML y Java lineal para evitar bloqueos del Extension Host.
- Caché compartido por documento y versión para enlaces, hover, diagnósticos y navegación.
- Índice Java incremental: al guardar se procesa únicamente el archivo modificado.
- Análisis completo solo para beans anotados; las clases implícitas se resuelven bajo demanda.
- Activación limitada a espacios de trabajo JSF/XHTML y comandos explícitos.
- Lectura concurrente por lotes al buscar implementaciones de servicios.
- Exclusión de artefactos Maven y Gradle del paquete VSIX.

## 0.4.0

- Soporte para servicios inyectados mediante `@Resource`.
- Navegación para inyección por constructor con `@Inject` y `@Autowired`.
- Resolución por calificadores `@Qualifier`, `@Named` y `@Resource(name = ...)`.
- Selección de destino cuando una interfaz posee varias implementaciones.
- Búsqueda de implementaciones con nombres diferentes a la convención `InterfazImpl`.
- Proyecto demostrativo Maven para el recorrido XHTML → controlador → servicio.
- Presentación bilingüe, demostración animada y palabras clave internacionales.
- Validación continua en Linux, Windows y macOS.
- Publicación automatizada y reproducible mediante etiquetas Git.

## 0.3.1

- Se incorpora validación automática de tipos, estilo, pruebas y empaquetado.
- Se añade una prueba de integración para navegación XHTML y servicios Java.
- Se documentan la arquitectura, las contribuciones, la seguridad y la publicación.
- Se agregan metadatos profesionales para Visual Studio Marketplace.
- La versión mostrada en el canal de salida ahora se obtiene del manifiesto.

## 0.3.0

- Resolución de sobrecargas mediante cantidad y tipos de argumentos.
- Navegación EL encadenada a través de los tipos de retorno Java.
- Vista previa al pasar el cursor sobre referencias navegables.
- Autocompletado de beans y miembros en XHTML.
- Diagnósticos de beans y miembros inexistentes.
- Búsqueda de referencias Java hacia XHTML y servicios inyectados.
- Navegación de métodos heredados y reconocimiento de agregadores Gradle.
- Icono propio de JSF EL Navigator.

## 0.2.1

- Selección automática de la sobrecarga según la cantidad de argumentos.
- Prioridad para la clase de implementación; la interfaz queda como respaldo.
- Se evita mostrar una lista duplicada de definiciones de interfaz e implementación.

## 0.2.0

- Navegación con `Ctrl+clic` desde controladores Java hacia servicios inyectados.
- Resolución de la implementación concreta declarada en el `lookup` de `@EJB`.
- Búsqueda limitada al proyecto Maven agregador actual, incluidos sus módulos hermanos.

## 0.1.5

- Las referencias `#{bean.metodo}` se publican como enlaces de documento.
- `Ctrl+clic` usa el resolvedor propio aunque otra extensión HTML intercepte la definición.

## 0.1.4

- El índice compartido ya no se cancela cuando VS Code reemplaza una consulta de navegación.
- Se evita almacenar índices parciales o vacíos por movimientos del cursor.

## 0.1.3

- Lectura directa mediante Node para archivos Java locales.
- Se evita la interferencia de proveedores de filesystem de otras extensiones.

## 0.1.2

- Lectura Java mediante `TextDecoder` compatible con distintos Extension Hosts.
- Resolución de respaldo por convención de clase Java.
- Los errores de lectura se muestran siempre en el canal de diagnóstico.

## 0.1.1

- Comando directo `Ir a la definición Java` para evitar conflictos con otros proveedores.
- `F12` asignado directamente a JSF EL Navigator cuando el archivo termina en `.xhtml`.
- Acción disponible en el menú contextual del editor.
- Diagnóstico detallado cuando el cursor, bean o miembro no pueden resolverse.

## 0.1.0

- Navegación con `F12` o `Ctrl+clic` desde EL hacia beans Java.
- Soporte inicial para `@ManagedBean`, `@Named`, `@Controller` y `@Component`.
- Resolución de métodos, getters, propiedades y campos.
- Índice independiente por módulo Maven/Gradle.
- Invalidación automática del índice al modificar código Java.
- Comandos de reconstrucción y diagnóstico.
