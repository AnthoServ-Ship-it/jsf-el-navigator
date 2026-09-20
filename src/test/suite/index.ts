import { runExtensionIntegrationTests } from "./extension.test";
import { runRealProjectIntegrationTests } from "./realProject.test";

export async function run(): Promise<void> {
    if (process.env.JSF_EL_REAL_PROJECT_TESTS === "1") {
        await runRealProjectIntegrationTests();
    } else {
        await runExtensionIntegrationTests();
    }
}
