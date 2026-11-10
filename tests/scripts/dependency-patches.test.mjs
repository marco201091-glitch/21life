import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const require = createRequire(
  new URL("../../expo/package.json", import.meta.url),
);
test("braces rejects excessive nesting before recursive compilation", () => {
  const braces = require("braces");
  assert.throws(
    () => braces.parse("{".repeat(129) + "x" + "}".repeat(129)),
    /nesting limit/,
  );
  assert.throws(
    () => braces.parse("(".repeat(129) + "x" + ")".repeat(129)),
    /nesting limit/,
  );
  assert.deepEqual(braces.expand("src/{app,lib}/{a,b}.ts"), [
    "src/app/a.ts",
    "src/app/b.ts",
    "src/lib/a.ts",
    "src/lib/b.ts",
  ]);
});
test("forge rejects nested DigestAlgorithm garbage but verifies standard signatures", () => {
  const forge = require("node-forge");
  const key = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 65537 });
  const md = () => forge.md.sha256.create().update("security-regression");
  const a = forge.asn1,
    c = (type, constructed, value) =>
      a.create(a.Class.UNIVERSAL, type, constructed, value);
  const der = a
    .toDer(
      c(a.Type.SEQUENCE, true, [
        c(a.Type.SEQUENCE, true, [
          c(a.Type.OID, false, a.oidToDer(forge.pki.oids.sha256).getBytes()),
          c(a.Type.NULL, false, ""),
          c(a.Type.OCTETSTRING, false, "extra"),
        ]),
        c(a.Type.OCTETSTRING, false, md().digest().getBytes()),
      ]),
    )
    .getBytes();
  assert.equal(
    key.publicKey.verify(md().digest().getBytes(), key.privateKey.sign(md())),
    true,
  );
  assert.throws(
    () =>
      key.publicKey.verify(
        md().digest().getBytes(),
        key.privateKey.sign(der, "NONE"),
      ),
    /DigestInfo/,
  );
});
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patches,
  verifyDependencyPatches,
  applyDependencyPatches,
} from "../../scripts/dependency-patches.mjs";
test("patches fail closed on tampered installed bytes and are idempotent", () => {
  mkdirSync(resolve("artifacts"), { recursive: true });
  const root = mkdtempSync(resolve("artifacts", "patch-test-"));
  const packages = {};
  for (const patch of patches) {
    const path = "node_modules/" + patch.package;
    mkdirSync(join(root, path, "lib"), { recursive: true });
    writeFileSync(
      join(root, path, patch.file),
      readFileSync(
        fileURLToPath(
          new URL("../../expo/" + path + "/" + patch.file, import.meta.url),
        ),
      ),
    );
    packages[path] = { version: patch.version };
  }
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages }));
  assert.equal(verifyDependencyPatches(root), true);
  applyDependencyPatches(root);
  const file = join(root, "node_modules/braces/lib/parse.js");
  writeFileSync(file, readFileSync(file, "utf8") + "\n// tampered");
  assert.equal(verifyDependencyPatches(root), false);
  assert.throws(() => applyDependencyPatches(root), /source mismatch/);
});
