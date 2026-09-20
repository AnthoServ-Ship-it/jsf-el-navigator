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
    npx vsce publish --packagePath jsf-el-navigator-0.4.0.vsix
    ```

Nunca agregues tokens, contraseñas ni archivos `.env` al repositorio.

## 4. Publicación automatizada por etiqueta

El workflow `.github/workflows/release.yml` valida, prueba, empaqueta, publica en
Marketplace y crea una versión descargable en GitHub.

Configura una sola vez el secreto `VSCE_PAT` en:

```text
GitHub → Settings → Secrets and variables → Actions → New repository secret
```

Después actualiza `package.json` y `CHANGELOG.md`, confirma los cambios y crea una
etiqueta que coincida exactamente con la versión:

```bash
git tag v0.4.0
git push origin master
git push origin v0.4.0
```

No reutilices etiquetas y no guardes el PAT en archivos, comandos versionados ni
capturas de pantalla.
