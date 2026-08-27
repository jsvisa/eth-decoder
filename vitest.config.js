import { defineConfig } from "vitest/config";
import { loadEnv, transformWithEsbuild } from "vite";

// Load `.env` into process.env so test workers inherit INTEGRATION_RPC_URL,
// INTEGRATION_ETHERSCAN_API_KEY, etc. when running integration tests locally.
const envDir = new URL(".", import.meta.url).pathname;
Object.assign(process.env, loadEnv("", envDir, ""));

// Transform JSX in .js files (components) before vite:import-analysis runs
const jsxInJsPlugin = {
  name: "jsx-in-js",
  enforce: "pre",
  async transform(code, id) {
    if (!id.endsWith(".js") || !id.includes("/app/")) return null;
    if (!code.includes("<")) return null;
    return transformWithEsbuild(code, id.replace(/\.js$/, ".jsx"), {
      loader: "jsx",
      jsx: "automatic",
      jsxImportSource: "react",
    });
  },
};

export default defineConfig({
  plugins: [jsxInJsPlugin],
  test: {
    globals: true,
    passWithNoTests: true,
    include: [],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["app/utils/**", "app/api/**"],
    },
    projects: [
      {
        plugins: [jsxInJsPlugin],
        test: {
          name: "unit",
          include: ["tests/unit/**"],
          exclude: ["tests/unit/setup.js"],
          environment: "jsdom",
          setupFiles: ["tests/unit/setup.js"],
        },
      },
      {
        test: {
          name: "api",
          include: ["tests/api/**"],
          exclude: ["tests/api/__fixtures__/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "benchmark",
          include: ["tests/benchmark/**"],
          exclude: [
            "tests/benchmark/__fixtures__/**",
            // worker entry points, not test files
            "tests/benchmark/sim-worker.mjs",
            "tests/benchmark/sim-worker-hooks.mjs",
          ],
          environment: "node",
        },
      },
    ],
  },
});
