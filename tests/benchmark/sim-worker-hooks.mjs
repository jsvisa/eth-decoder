// Module resolution hook for the benchmark worker: app/ code is written with
// extensionless relative imports (bundler-style), which raw Node ESM cannot
// resolve. This hook appends ".js" and retries before falling back.
export async function resolve(specifier, context, next) {
  if (
    specifier.startsWith(".") &&
    !/\.[cm]?js$/i.test(specifier) &&
    !specifier.endsWith(".json")
  ) {
    try {
      return await next(`${specifier}.js`, context);
    } catch {
      /* fall through to the default resolver */
    }
  }
  return next(specifier, context);
}
