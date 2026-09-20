# Publicación

## 1. Crear el repositorio

El manifiesto utiliza esta dirección:

```text
https://github.com/AnthoServ-Ship-it/jsf-el-navigator
```

Si el usuario u organización de GitHub es diferente, actualiza `repository`,
`homepage` y `bugs` en `package.json` antes de publicar.

## 2. Validar y empaquetar

```bash
npm ci
npm run validate
npm run test:integration
npm run package
```

El archivo resultante será `jsf-el-navigator-<versión>.vsix`.

## 3. Publicar en Visual Studio Marketplace

1. Crea el publicador `anthoserv` en Visual Studio Marketplace.
2. Genera un Personal Access Token de Azure DevOps con permiso Marketplace Manage.
3. Inicia sesión sin almacenar el token dentro del repositorio:

    ```bash
    npx vsce login anthoserv
    ```

4. Publica el VSIX validado:

    ```bash
    npx vsce publish --packagePath jsf-el-navigator-0.3.1.vsix
    ```

Nunca agregues tokens, contraseñas ni archivos `.env` al repositorio.
