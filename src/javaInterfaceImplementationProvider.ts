import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { parseJavaBean } from "./javaParser";
import { type JavaTypeAnalysisCache } from "./javaTypeAnalysisCache";
import { findProjectRoot } from "./moduleResolver";
import { type JavaMember, type ParsedJavaBean, type SourceSpan } from "./types";

/** Navega bajo demanda desde un método de interfaz hacia su implementación concreta. */
export class JavaInterfaceImplementationProvider
    implements vscode.DefinitionProvider, vscode.ImplementationProvider, vscode.Disposable
{
    private readonly implementationFiles = new Map<string, vscode.Uri[]>();
    private readonly interfaceFiles = new Map<string, vscode.Uri[]>();

    public constructor(private readonly analysis: JavaTypeAnalysisCache) {}

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        return this.resolve(document, position, token);
    }

    public provideImplementation(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        return this.resolve(document, position, token);
    }

    public async resolve(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        const enabled = vscode.workspace
            .getConfiguration("jsfElNavigator", document.uri)
            .get<boolean>("javaServiceNavigation.enabled", true);
        if (!enabled || !document.fileName.toLowerCase().endsWith(".java")) {
            return undefined;
        }

        const parsed = this.analysis.get(document);
        if (!parsed) {
            return undefined;
        }

        const offset = document.offsetAt(position);
        const member = parsed.members.find(
            (candidate) =>
                candidate.kind === "method" &&
                offset >= candidate.span.start &&
                offset <= candidate.span.end
        );
        if (!member) {
            return undefined;
        }

        if (parsed.typeKind === "class") {
            return this.resolveInterfaceDeclaration(document, parsed, member, token);
        }

        const projectRoot = await findProjectRoot(document.uri);
        const originSelectionRange = rangeFromSpan(document, member.span);
        const cacheKey = `${projectRoot.toString()}#${parsed.className}`;
        const cachedFiles = this.implementationFiles.get(cacheKey);
        if (cachedFiles) {
            const cachedLinks = await this.createImplementationLinks(
                cachedFiles,
                parsed,
                member,
                originSelectionRange,
                token
            );
            return cachedLinks.length > 0 ? cachedLinks : undefined;
        }

        const conventionalFiles = await this.findConventionalFiles(projectRoot, parsed.className);
        const conventionalLinks = await this.createImplementationLinks(
            conventionalFiles,
            parsed,
            member,
            originSelectionRange,
            token
        );
        if (conventionalLinks.length > 0 || token.isCancellationRequested) {
            if (conventionalLinks.length > 0) {
                this.implementationFiles.set(cacheKey, conventionalFiles);
            }
            return conventionalLinks.length > 0 ? conventionalLinks : undefined;
        }

        const implementationFiles = await this.findImplementationFiles(
            projectRoot,
            parsed.className,
            token
        );
        const links = await this.createImplementationLinks(
            implementationFiles,
            parsed,
            member,
            originSelectionRange,
            token
        );
        if (links.length > 0) {
            this.implementationFiles.set(cacheKey, implementationFiles);
        }
        return links.length > 0 ? links : undefined;
    }

    public dispose(): void {
        this.implementationFiles.clear();
        this.interfaceFiles.clear();
    }

    private async resolveInterfaceDeclaration(
        document: vscode.TextDocument,
        implementation: ParsedJavaBean,
        implementationMember: JavaMember,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[] | undefined> {
        if (implementation.interfaceNames.length === 0) return undefined;

        const projectRoot = await findProjectRoot(document.uri);
        const cacheKey = `${projectRoot.toString()}#${implementation.className}`;
        let files = this.interfaceFiles.get(cacheKey);
        if (!files) {
            const groups = await Promise.all(
                implementation.interfaceNames.map((interfaceName) =>
                    vscode.workspace.findFiles(
                        new vscode.RelativePattern(
                            projectRoot,
                            `**/src/main/java/**/${simpleClassName(interfaceName)}.java`
                        ),
                        "**/{target,build,node_modules,.git}/**"
                    )
                )
            );
            files = uniqueUris(groups.flat());
            if (files.length > 0) {
                this.interfaceFiles.set(cacheKey, files);
            }
        }

        const originSelectionRange = rangeFromSpan(document, implementationMember.span);
        const links: vscode.LocationLink[] = [];
        for (const uri of files) {
            if (token.isCancellationRequested) break;
            const source = await readSource(uri);
            const candidate = parseJavaBean(source, true);
            if (candidate?.typeKind !== "interface") continue;

            const members = selectMatchingMembers(candidate.members, implementationMember);
            const targetDocument = await vscode.workspace.openTextDocument(uri);
            for (const member of members) {
                const targetSelectionRange = rangeFromSpan(targetDocument, member.span);
                links.push({
                    originSelectionRange,
                    targetUri: uri,
                    targetRange: targetSelectionRange,
                    targetSelectionRange
                });
            }
        }
        return links.length > 0 ? links : undefined;
    }

    private findConventionalFiles(
        projectRoot: vscode.Uri,
        interfaceName: string
    ): Thenable<vscode.Uri[]> {
        return vscode.workspace.findFiles(
            new vscode.RelativePattern(
                projectRoot,
                `**/src/main/java/**/${interfaceName}Impl.java`
            ),
            "**/{target,build,node_modules,.git}/**"
        );
    }

    private async findImplementationFiles(
        projectRoot: vscode.Uri,
        interfaceName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectRoot, "**/src/main/java/**/*.java"),
            "**/{target,build,node_modules,.git}/**"
        );
        const matches: vscode.Uri[] = [];

        for (let start = 0; start < files.length; start += 32) {
            if (token.isCancellationRequested) break;
            const batch = files.slice(start, start + 32);
            const sources = await Promise.all(
                batch.map(async (uri) => ({ uri, source: await readSource(uri) }))
            );
            for (const { uri, source } of sources) {
                const candidate = parseJavaBean(source, true);
                if (
                    candidate?.typeKind === "class" &&
                    candidate.interfaceNames.some((name) => simpleClassName(name) === interfaceName)
                ) {
                    matches.push(uri);
                }
            }
        }
        return matches;
    }

    private async createImplementationLinks(
        files: vscode.Uri[],
        serviceInterface: ParsedJavaBean,
        interfaceMember: JavaMember,
        originSelectionRange: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.LocationLink[]> {
        const links: vscode.LocationLink[] = [];
        for (const uri of files) {
            if (token.isCancellationRequested) break;
            const source = await readSource(uri);
            const candidate = parseJavaBean(source, true);
            if (!candidate || candidate.typeKind !== "class") continue;
            if (
                !candidate.interfaceNames.some(
                    (name) => simpleClassName(name) === serviceInterface.className
                )
            ) {
                continue;
            }

            const members = selectMatchingMembers(candidate.members, interfaceMember);
            const targetDocument = await vscode.workspace.openTextDocument(uri);
            for (const member of members) {
                const targetSelectionRange = rangeFromSpan(targetDocument, member.span);
                links.push({
                    originSelectionRange,
                    targetUri: uri,
                    targetRange: targetSelectionRange,
                    targetSelectionRange
                });
            }
        }
        return links;
    }
}

function selectMatchingMembers(members: JavaMember[], expected: JavaMember): JavaMember[] {
    const sameArity = members.filter(
        (member) =>
            member.kind === "method" &&
            member.name === expected.name &&
            member.parameterCount === expected.parameterCount
    );
    const exact = sameArity.filter((member) =>
        sameTypes(member.parameterTypes, expected.parameterTypes)
    );
    return exact.length > 0 ? exact : sameArity;
}

function sameTypes(left: string[] | undefined, right: string[] | undefined): boolean {
    if (!left || !right || left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function simpleClassName(value: string): string {
    const withoutGenerics = value.replace(/<.*>/, "").trim();
    return withoutGenerics.slice(withoutGenerics.lastIndexOf(".") + 1);
}

function rangeFromSpan(document: vscode.TextDocument, span: SourceSpan): vscode.Range {
    return new vscode.Range(document.positionAt(span.start), document.positionAt(span.end));
}

function uniqueUris(groups: vscode.Uri[]): vscode.Uri[] {
    const seen = new Set<string>();
    return groups.filter((uri) => {
        const key = uri.toString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function readSource(uri: vscode.Uri): Promise<string> {
    return uri.scheme === "file"
        ? readFile(uri.fsPath, "utf8")
        : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
}
