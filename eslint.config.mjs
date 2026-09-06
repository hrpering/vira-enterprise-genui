import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".build/**",
      "**/.next/**",
      "coverage/**",
      "node_modules/**",
      "examples/experience-studio-demo/dist/**",
      "apps/vira-web/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "packages/adapter-sdk/src/action/validate.ts",
      "packages/adapter-sdk/src/brand/validate.ts",
      "packages/adapter-sdk/src/intent/validate.ts",
      "packages/adapter-sdk/src/connector/validate.ts",
      "packages/provider-connection/src/connection.ts",
      "packages/protocol/src/patch/validate.ts",
      "packages/runtime-core/src/errors/create.ts",
      "packages/studio-*/src/**/*.ts",
      "packages/application-canvas-ai/src/propose.ts",
      "packages/application-canvas-collaboration/src/session.ts",
      "packages/application-canvas-design-import/src/import.ts",
      "packages/application-protocol-projection/src/validate.ts",
      "packages/application-publisher-sdk/src/prepare.ts",
    ],
    rules: {
      "no-control-regex": "off",
    },
  },
  {
    files: ["packages/application-canvas-design-import/src/import.ts"],
    rules: {
      "no-useless-escape": "off",
    },
  },
  {
    files: ["packages/commercial-entitlement/src/entitlement.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^ViraCommercialEntitlementSet$" },
      ],
    },
  },
  {
    files: ["tooling/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["apps/vira-web/app.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    files: ["apps/vira-web/build.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["ops/**/*.ts", "tests/production/**/*.ts"],
    languageOptions: {
      globals: {
        URL: "readonly",
        Response: "readonly",
        fetch: "readonly",
      },
    },
  },
);
