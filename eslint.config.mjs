import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".build/**", "coverage/**", "node_modules/**", "examples/experience-studio-demo/dist/**"],
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
);
