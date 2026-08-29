import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "examples/experience-studio-demo/tests/**",
    ],
  },
});
