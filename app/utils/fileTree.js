// Build a collapsible directory tree from a flat map of file paths.

export function buildFileTree(fileNames) {
  const root = { name: "", path: "", children: new Map() };
  for (const name of fileNames || []) {
    const parts = name.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.children.set(path, {
          type: "file",
          name: parts[i],
          path,
        });
      } else {
        if (!node.children.has(path)) {
          node.children.set(path, {
            type: "dir",
            name: parts[i],
            path,
            children: new Map(),
          });
        }
        node = node.children.get(path);
      }
    }
  }
  return finalize([...root.children.values()]);
}

// Merge single-child directory chains (e.g. `contracts` + `token` becomes
// `contracts/token`) and sort dirs first, then files, alphabetically.
function finalize(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      const children = finalize([...node.children.values()]);
      if (children.length === 1 && children[0].type === "dir") {
        const merged = children[0];
        merged.name = `${node.name}/${merged.name}`;
        out.push(merged);
        continue;
      }
      out.push({ ...node, children });
    } else {
      out.push(node);
    }
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Prune a tree to files whose full path contains `query` (case-insensitive),
// keeping ancestor directories. Returns null when nothing matches.
export function filterTree(nodes, query) {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const out = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.path.toLowerCase().includes(q)) out.push(node);
    } else {
      const children = filterTree(node.children, query);
      if (children) out.push({ ...node, children });
    }
  }
  return out.length ? out : null;
}
