# Estilo de ingeniería Anthoserv

Este documento convierte el estilo del autor en reglas reproducibles para futuros
cambios.

## Principios

1. Resolver primero el problema real del desarrollador empresarial.
2. Mantener la navegación rápida en repositorios grandes y multi-módulo.
3. Preferir componentes pequeños con una responsabilidad clara.
4. Explicar las decisiones relevantes mediante comentarios breves en español.
5. Entregar diagnósticos comprensibles antes que fallos silenciosos.
6. Preservar la privacidad: análisis local y sin telemetría por defecto.

## Código

- TypeScript estricto, cuatro espacios y comillas dobles.
- Nombres técnicos en inglés; textos visibles y pruebas en español.
- Retornos tempranos para reducir anidamiento.
- Recursos registrados en `context.subscriptions`.
- Caché por módulo para operaciones repetidas.
- Lotes limitados para acceso concurrente al sistema de archivos.
- Toda corrección debe incluir una prueba que reproduzca el caso.

## Calidad

`npm run validate` es la puerta mínima de calidad. Debe comprobar tipos, reglas de
estilo, formato y pruebas unitarias. La integración completa se ejecuta mediante
`npm run test:integration` y en GitHub Actions.
