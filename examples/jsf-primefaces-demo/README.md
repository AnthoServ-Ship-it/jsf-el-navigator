# Proyecto demostrativo

Este proyecto Maven multi-módulo permite probar JSF EL Navigator sin utilizar
código empresarial privado.

1. Abre esta carpeta en Visual Studio Code.
2. Abre `web/src/main/webapp/clientes.xhtml`.
3. Mantén `Ctrl` y haz clic en `clienteController.guardar`.
4. En `ClienteController.java`, haz `Ctrl+clic` en `clienteService.guardar`.

El recorrido esperado es:

```text
clientes.xhtml -> ClienteController -> ClienteServiceImpl
```

También puedes comprobar que el ejemplo Java compila:

```bash
mvn test
```
