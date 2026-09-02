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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "packages/adapter-sdk/src/action/validate.ts",
      "packages/adapter-sdk/src/brand/validate.ts",
      "packages/adapter-sdk/src/intent/validate.ts",
      "packages/protocol/src/patch/validate.ts",
      "packages/runtime-core/src/errors/create.ts",
      "packages/studio-*/src/**/*.ts",
    ],
    rules: {
      "no-control-regex": "off",
    },
  },
  {
    files: [
      "tooling/check-studio-interop.mjs",
      "tooling/check-studio-native-conformance.mjs",
      "tooling/finalize-studio-interop.mjs",
      "tooling/generate-studio-interop.mjs",
    ],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
