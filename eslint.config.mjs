import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", ".vscode-test/**"]
    },
    {
        ...eslint.configs.recommended,
        files: ["src/**/*.ts"]
    },
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ["src/**/*.ts"]
    })),
    {
        files: ["src/**/*.ts"],
        rules: {
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports", fixStyle: "inline-type-imports" }
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
            ],
            "no-console": "error"
        }
    }
);
