// Node 26 defines an experimental globalThis.localStorage that returns
// undefined without --localstorage-file. vitest's jsdom environment skips
// copying localStorage from jsdom's window because the property already
// exists on globalThis. Override it with a simple mock.
if (typeof localStorage === "undefined" && "localStorage" in globalThis) {
  const store = new Map();
  const mock = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
  };
  delete globalThis.localStorage;
  globalThis.localStorage = mock;
}
