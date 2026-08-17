import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const required = ["index.js", "index.d.ts", "styles.css"];
const forbiddenNames = [/\.map$/i, /^demo$/i, /^site-dist$/i, /^node_modules$/i, /^\.env/i];
const forbiddenText = [
  /sourceMappingURL/i,
  /microsoft\.ai/i,
  /BlockGL-/i,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /npm_[A-Za-z0-9]{20,}/,
  /[A-Z]:\\Users\\/i,
  /file:\/\//i,
];

for (const file of required) {
  if (!(await stat(new URL(file, dist)).catch(() => null))) throw new Error(`Missing dist/${file}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (forbiddenNames.some((pattern) => pattern.test(entry.name))) throw new Error(`Forbidden distribution path: ${entry.name}`);
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) await walk(target);
    else {
      const text = await readFile(target, "utf8").catch(() => "");
      for (const pattern of forbiddenText) {
        if (pattern.test(text)) throw new Error(`Forbidden distribution content in ${target.pathname}: ${pattern}`);
      }
    }
  }
}

await walk(dist);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (manifest.files.some((entry) => entry === "demo" || entry === "site-dist")) throw new Error("Demo paths must not enter the package files allowlist.");
console.log("Distribution boundary verified.");
