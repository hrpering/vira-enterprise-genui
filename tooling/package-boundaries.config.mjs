export const workspaceScope = "@vira-enterprise-genui/";

export const allowedDependencies = Object.freeze({
  protocol: [],
  "runtime-core": ["protocol"],
  planner: ["protocol", "runtime-core"],
  composer: ["protocol", "planner", "adapter-sdk"],
  "adapter-sdk": ["protocol"],
  "runtime-web": ["protocol", "runtime-core", "composer", "adapter-sdk", "security"],
  "web-component": ["runtime-web"],
  react: ["runtime-web"],
  security: [],
  telemetry: [],
  "tool-bridge": ["protocol"],
  "studio-schema": ["protocol"],
  "studio-compiler": ["studio-schema"],
  "studio-catalog": ["protocol", "studio-schema"],
});
