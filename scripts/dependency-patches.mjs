import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const patches = JSON.parse(
  readFileSync(
    new URL("./security/dependency-patches.json", import.meta.url),
    "utf8",
  ),
);
const hash = (source) => createHash("sha256").update(source).digest("hex");
export function verifyDependencyPatches(projectDir) {
  try {
    const lock = JSON.parse(
      readFileSync(resolve(projectDir, "package-lock.json"), "utf8"),
    );
    for (const patch of patches) {
      const nodes = Object.entries(lock.packages).filter(([path]) =>
        path.endsWith("node_modules/" + patch.package),
      );
      if (!nodes.length) return false;
      for (const [path, pkg] of nodes) {
        if (
          pkg.version !== patch.version ||
          hash(readFileSync(resolve(projectDir, path, patch.file))) !==
            patch.patchedSha256
        )
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
export function applyDependencyPatches(projectDir) {
  const lock = JSON.parse(
    readFileSync(resolve(projectDir, "package-lock.json"), "utf8"),
  );
  for (const patch of patches) {
    const nodes = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith("node_modules/" + patch.package),
    );
    if (!nodes.length)
      throw Error("Missing security patch target: " + patch.package);
    for (const [path, pkg] of nodes) {
      const file = resolve(projectDir, path, patch.file),
        source = readFileSync(file, "utf8"),
        digest = hash(source);
      if (pkg.version !== patch.version)
        throw Error("Security patch version mismatch: " + path);
      if (digest === patch.patchedSha256) continue;
      if (digest !== patch.originalSha256)
        throw Error("Security patch source mismatch: " + path);
      const patched = source.replaceAll(patch.before, patch.after);
      if (hash(patched) !== patch.patchedSha256)
        throw Error("Security patch output mismatch");
      writeFileSync(file, patched);
    }
  }
  if (!verifyDependencyPatches(projectDir))
    throw Error("Security patches verification failed");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const projectDir = resolve(process.argv[2] || "expo");
  if (!existsSync(resolve(projectDir, "node_modules")))
    throw Error("Install dependencies first");
  applyDependencyPatches(projectDir);
  console.log("Security patches applied and SHA-256 verified.");
}
