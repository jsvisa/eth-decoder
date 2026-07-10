import { defineConfig } from "vitest/config";
import { transformWithEsbuild } from "vite";

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
      reporter: ["text", "html"],
      include: ["app/utils/**", "app/api/**"],
    },
    projects: [
      {
        name: "unit",
        plugins: [jsxInJsPlugin],
        test: {
          include: ["tests/unit/**"],
          exclude: ["tests/unit/setup.js"],
          environment: "jsdom",
          setupFiles: ["tests/unit/setup.js"],
        },
      },
      {
        name: "api",
        test: {
          include: ["tests/api/**"],
          exclude: [
            "tests/api/__fixtures__/**",
          ],
          environment: "node",
        },
      },
    ],
  },
});
