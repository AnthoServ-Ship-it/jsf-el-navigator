# Registro de cambios

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
