import { describe, it, expect } from "vitest";
import { buildFileTree, filterTree } from "../../app/utils/fileTree.js";

describe("buildFileTree", () => {
  it("builds nested directories from flat paths", () => {
    const tree = buildFileTree([
      "contracts/token/ERC20.sol",
      "contracts/Token.sol",
      "interfaces/IERC20.sol",
      "metadata.json",
    ]);
    expect(tree.map((n) => n.name)).toEqual([
      "contracts",
      "interfaces",
      "metadata.json",
    ]);
    const contracts = tree[0];
    expect(contracts.type).toBe("dir");
    // dirs sort before files
    expect(contracts.children.map((n) => `${n.type}:${n.name}`)).toEqual([
      "dir:token",
      "file:Token.sol",
    ]);
    const tokenDir = contracts.children[0];
    expect(tokenDir.children[0].name).toBe("ERC20.sol");
    expect(tokenDir.children[0].path).toBe("contracts/token/ERC20.sol");
  });

  it("merges single-child directory chains", () => {
    const tree = buildFileTree(["a/b/c/Deep.sol"]);
    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe("a/b/c");
    expect(tree[0].children[0].type).toBe("file");
    expect(tree[0].children[0].path).toBe("a/b/c/Deep.sol");
  });

  it("sorts directories before files, alphabetically", () => {
    const tree = buildFileTree(["zeta.sol", "alpha/one.sol", "beta.sol"]);
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      "dir:alpha",
      "file:beta.sol",
      "file:zeta.sol",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(buildFileTree([])).toEqual([]);
    expect(buildFileTree(null)).toEqual([]);
  });
});

describe("filterTree", () => {
  const tree = buildFileTree([
    "contracts/token/ERC20.sol",
    "contracts/Token.sol",
    "interfaces/IERC20.sol",
  ]);

  it("returns the tree unchanged for empty query", () => {
    expect(filterTree(tree, "")).toBe(tree);
    expect(filterTree(tree, null)).toBe(tree);
  });

  it("keeps matching files and their ancestor dirs", () => {
    const out = filterTree(tree, "erc20");
    expect(out.length).toBe(2);
    expect(out[0].children[0].name).toBe("token");
    expect(out[0].children[0].children[0].name).toBe("ERC20.sol");
    expect(out[1].children[0].name).toBe("IERC20.sol");
  });

  it("matches on full paths", () => {
    const out = filterTree(tree, "token/");
    expect(out.length).toBe(1);
    expect(out[0].children[0].name).toBe("token");
    expect(out[0].children[0].children[0].name).toBe("ERC20.sol");
  });

  it("returns null when nothing matches", () => {
    expect(filterTree(tree, "nope")).toBeNull();
  });
});
