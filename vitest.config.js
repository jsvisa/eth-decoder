import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/utils/**", "app/api/**"],
    },
    projects: [
      {
        test: {
          include: ["tests/unit/**"],
          environment: "jsdom",
        },
      },
      {
        test: {
          include: ["tests/api/**"],
          exclude: [
            "tests/api/__fixtures__/**",
            "tests/e2e/**",
            "node_modules/**",
          ],
          environment: "node",
        },
      },
    ],
  },
});
