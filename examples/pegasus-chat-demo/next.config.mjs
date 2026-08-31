/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@vira-enterprise-genui/adapter-sdk",
    "@vira-enterprise-genui/airline-brand-kit",
    "@vira-enterprise-genui/composer",
    "@vira-enterprise-genui/experience-studio-demo",
    "@vira-enterprise-genui/mock-airline-domain",
    "@vira-enterprise-genui/planner",
    "@vira-enterprise-genui/protocol",
    "@vira-enterprise-genui/react",
    "@vira-enterprise-genui/runtime-core",
    "@vira-enterprise-genui/runtime-web",
    "@vira-enterprise-genui/studio-publish",
    "@vira-enterprise-genui/studio-runtime",
    "@vira-enterprise-genui/studio-runtime-react",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
