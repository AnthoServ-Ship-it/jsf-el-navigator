# Contribuir a JSF EL Navigator

Gracias por ayudar a mejorar el proyecto de **anthoserv**.

## Preparación

Se requiere Node.js 18.19 o posterior. Para instalar y validar el proyecto:

```bash
npm ci
npm run validate
```

La prueba de integración abre una instancia aislada de Visual Studio Code:

```bash
npm run test:integration
```

## Flujo de trabajo

1. Crea una rama desde `master`.
2. Mantén cada cambio enfocado en un único problema.
3. Agrega pruebas para los casos nuevos o corregidos.
4. Ejecuta `npm run validate` antes de enviar el cambio.
5. Describe el comportamiento anterior y el nuevo en la solicitud de cambio.

## Convenciones

- El código y los identificadores técnicos se escriben en inglés.
- La documentación, los mensajes de usuario y las pruebas se escriben en español.
- La navegación debe permanecer limitada al módulo o agregador del documento.
- Toda operación costosa debe respetar cancelación o reutilizar un índice.
- No se agregan telemetría ni conexiones externas sin documentación y consentimiento.

Consulta [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) para conocer el estilo completo.
