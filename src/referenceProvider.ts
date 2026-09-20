import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { findAllElTargets } from "./elParser";
import { findAllJavaServiceTargets } from "./javaServiceParser";
import { parseJavaBean } from "./javaParser";
import { findNearestModuleRoot, findProjectRoot } from "./moduleResolver";

/** Busca usos XHTML de controladores y usos Java de servicios inyectados. */
export class JsfJavaReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        const source = document.getText();
        const parsed = parseJavaBean(source, true);
        if (!parsed) return undefined;

        const offset = document.offsetAt(position);
        const member = parsed.members.find(
            (item) => item.kind === "method" && offset >= item.span.start && offset <= item.span.end
        );
        if (!member) return undefined;

        const locations: vscode.Location[] = [];
        if (context.includeDeclaration) {
            locations.push(
                new vscode.Location(
                    document.uri,
                    new vscode.Range(
                        document.positionAt(member.span.start),
                        document.positionAt(member.span.end)
                    )
                )
            );
        }

        const explicitBean = parseJavaBean(source, false);
        if (explicitBean) {
            locations.push(
                ...(await this.findXhtmlReferences(
                    document.uri,
                    new Set(explicitBean.beanNames),
                    member.name,
                    token
                ))
            );
        }

        locations.push(
            ...(await this.findJavaReferences(
                document.uri,
                parsed.className,
                new Set(parsed.interfaceNames),
                member.name,
                member.parameterCount,
                member.parameterTypes,
                token
            ))
        );

        return locations.length > 0 ? locations : undefined;
    }

    private async findXhtmlReferences(
        documentUri: vscode.Uri,
        beanNames: Set<string>,
        methodName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const moduleRoot = await findNearestModuleRoot(documentUri);
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(moduleRoot, "src/main/webapp/**/*.xhtml"),
            "**/{target,build,node_modules,.git}/**"
        );
        const locations: vscode.Location[] = [];

        for (const uri of files) {
            if (token.isCancellationRequested) break;
            const source = await readSource(uri);
            for (const target of findAllElTargets(source)) {
                if (target.selectedIndex !== 1 || !beanNames.has(target.beanName)) continue;
                const selected = target.segments[1];
                if (selected.name !== methodName) continue;
                locations.push(await locationFromOffsets(uri, selected.start, selected.end));
            }
        }
        return locations;
    }

    private async findJavaReferences(
        documentUri: vscode.Uri,
        className: string,
        interfaces: Set<string>,
        methodName: string,
        parameterCount: number | undefined,
        parameterTypes: string[] | undefined,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const projectRoot = await findProjectRoot(documentUri);
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectRoot, "**/src/main/java/**/*.java"),
            "**/{target,build,node_modules,.git}/**"
        );
        const acceptedTypes = new Set([className, ...interfaces]);
        if (className.endsWith("Impl")) acceptedTypes.add(className.slice(0, -4));
        const locations: vscode.Location[] = [];

        for (let start = 0; start < files.length; start += 24) {
            if (token.isCancellationRequested) break;
            const batch = files.slice(start, start + 24);
            const sources = await Promise.all(
                batch.map(async (uri) => ({
                    uri,
                    source: await readSource(uri)
                }))
            );
            for (const item of sources) {
                for (const target of findAllJavaServiceTargets(item.source)) {
                    const matchesType =
                        acceptedTypes.has(target.service.typeName) ||
                        (target.service.implementationClass
                            ? acceptedTypes.has(target.service.implementationClass)
                            : false);
                    const matchesSignature =
                        parameterCount === undefined ||
                        (target.argumentCount === parameterCount &&
                            typesCanMatch(target.argumentTypes, parameterTypes));
                    if (matchesType && matchesSignature && target.methodName === methodName) {
                        locations.push(
                            await locationFromOffsets(
                                item.uri,
                                target.methodSpan.start,
                                target.methodSpan.end
                            )
                        );
                    }
                }
            }
        }
        return locations;
    }
}

function typesCanMatch(
    argumentTypes: Array<string | undefined>,
    parameterTypes: string[] | undefined
): boolean {
    if (!parameterTypes) return true;
    const wrappers: Record<string, string> = {
        boolean: "Boolean",
        byte: "Byte",
        char: "Character",
        double: "Double",
        float: "Float",
        int: "Integer",
        long: "Long",
        short: "Short"
    };
    return parameterTypes.every((parameter, index) => {
        const argument = argumentTypes[index];
        if (!argument) return true;
        return (wrappers[argument] ?? argument) === (wrappers[parameter] ?? parameter);
    });
}

async function readSource(uri: vscode.Uri): Promise<string> {
    return uri.scheme === "file"
        ? readFile(uri.fsPath, "utf8")
        : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
}

async function locationFromOffsets(
    uri: vscode.Uri,
    start: number,
    end: number
): Promise<vscode.Location> {
    const document = await vscode.workspace.openTextDocument(uri);
    return new vscode.Location(
        uri,
        new vscode.Range(document.positionAt(start), document.positionAt(end))
    );
}
