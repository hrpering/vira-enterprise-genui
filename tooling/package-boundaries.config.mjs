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
  "studio-puck-adapter": ["protocol", "studio-schema", "studio-catalog"],
  "studio-react": ["studio-schema", "studio-catalog", "studio-puck-adapter"],
  "studio-puck-authoring": ["protocol", "studio-schema", "studio-catalog", "studio-puck-adapter"],
  "studio-binding": ["protocol", "studio-schema", "studio-catalog"],
});
