import { runExtensionIntegrationTests } from "./extension.test";

export async function run(): Promise<void> {
    await runExtensionIntegrationTests();
}
