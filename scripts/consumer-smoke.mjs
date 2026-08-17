import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const spawnOptions = (cwd) => ({ cwd, encoding: "utf8", shell: process.platform === "win32" });
const packed = spawnSync(npm, ["pack", "--ignore-scripts", "--silent"], spawnOptions(root));
if (packed.status !== 0) throw new Error(packed.stderr || packed.error?.message || "npm pack failed");
const archive = path.join(root, packed.stdout.trim().split(/\r?\n/).at(-1));
const consumer = await mkdtemp(path.join(tmpdir(), "seam-rayfield-consumer-"));

try {
  await writeFile(path.join(consumer, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@seam-agency/seam-rayfield": `file:${archive.replaceAll("\\", "/")}`,
      react: "19.2.8",
      "react-dom": "19.2.8"
    }
  }, null, 2));
  const installed = spawnSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], spawnOptions(consumer));
  if (installed.status !== 0) throw new Error(installed.stderr || "Consumer install failed");
  const checked = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { SeamRayfield, createRayfieldConfig, createRayfieldRenderer } from '@seam-agency/seam-rayfield';
    if (typeof SeamRayfield !== 'object' && typeof SeamRayfield !== 'function') throw new Error('Missing React export');
    if (typeof createRayfieldRenderer !== 'function') throw new Error('Missing renderer export');
    if (createRayfieldConfig().source.mode !== 'procedural') throw new Error('Invalid default config');
  `], { cwd: consumer, encoding: "utf8" });
  if (checked.status !== 0) throw new Error(checked.stderr || "Consumer runtime import failed");
  const css = await readFile(path.join(consumer, "node_modules", "@seam-agency", "seam-rayfield", "dist", "styles.css"), "utf8");
  if (!css.includes(".seam-rayfield")) throw new Error("Consumer CSS export is invalid");
  console.log("Clean consumer installation verified.");
} finally {
  await rm(consumer, { recursive: true, force: true });
  await rm(archive, { force: true });
}
