#!/usr/bin/env node
/*
 * Pack the built extension into a signed .crx (CRX3) plus a matching .zip.
 *
 *   npm run build && npm run pack
 *
 * Packs dist/ as-is. It used to assemble its own build directory from a hand-listed
 * set of root files (manifest.json, icons/, data/sites.js, src/), which was right when
 * the repo *was* the extension. Now Vite produces the runtime tree, so duplicating that
 * list here would be a second definition of "what ships" — one that goes stale silently.
 *
 * Output goes to release/, not dist/: the build lives in dist/, and this script used to
 * delete it before packing.
 *
 * Signing key resolution (first match wins):
 *   1. $CRX_KEY       — the private-key PEM itself (raw, or base64-encoded).
 *   2. $CRX_KEY_PATH  — path to a private-key PEM file.
 *   3. none           — generate an EPHEMERAL key (prints a warning; the crx
 *                       will have an unstable extension id).
 *
 * Outputs (git-ignored):
 *   release/shabbat-closed-extension.crx
 *   release/shabbat-closed-extension.zip
 */
import crx3 from "crx3";
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import {
  writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const release = join(root, "release");
const NAME = "shabbat-closed-extension";

// Repo documentation that Vite copies out of public/ but that has no business in a
// published extension.
const EXCLUDE = new Set(["proof/README.md"]);

function resolveKeyPem() {
  if (process.env.CRX_KEY) {
    let v = process.env.CRX_KEY.trim();
    if (!v.includes("BEGIN")) v = Buffer.from(v, "base64").toString("utf8");
    return { pem: v, ephemeral: false };
  }
  if (process.env.CRX_KEY_PATH) {
    return { pem: readFileSync(process.env.CRX_KEY_PATH, "utf8"), ephemeral: false };
  }
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { pem: privateKey.export({ type: "pkcs1", format: "pem" }), ephemeral: true };
}

/** Chrome extension id: first 16 bytes of SHA-256(SPKI DER), mapped 0-f -> a-p. */
function extensionId(privatePem) {
  const spki = createPublicKey(privatePem).export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(spki).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0x0f));
  }
  return id;
}

/**
 * Absolute paths, deliberately: crx3 derives the zip root from the *first* entry in the
 * list, so a relative list beginning with "_locales/he/messages.json" makes it look for
 * the manifest at "/manifest.json" and fail. Given absolute paths it strips the common
 * parent, which is dist/, and the archive comes out correctly rooted.
 */
function walk(dir, base) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = base ? base + "/" + name : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else if (!EXCLUDE.has(rel)) out.push(abs);
  }
  return out;
}

// --- preconditions --------------------------------------------------------
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json not found — run `npm run build` first.");
  process.exit(1);
}

rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });

// --- key ------------------------------------------------------------------
const { pem, ephemeral } = resolveKeyPem();
const keyPath = join(release, "key.pem");
writeFileSync(keyPath, pem);
if (ephemeral) {
  console.warn(
    "! No CRX_KEY / CRX_KEY_PATH provided — using an EPHEMERAL key.\n" +
    "  The .crx will have an unstable extension id. Set the CRX_KEY secret for releases."
  );
}
console.log("extension id:", extensionId(pem));

// --- pack -----------------------------------------------------------------
const crxPath = join(release, `${NAME}.crx`);
const zipPath = join(release, `${NAME}.zip`);
const files = walk(dist);

await crx3(files, { keyPath, crxPath, zipPath });

const crx = readFileSync(crxPath);
const magic = crx.subarray(0, 4).toString("ascii");
if (magic !== "Cr24") throw new Error("bad crx magic: " + magic);
console.log(
  `packed ${files.length} files -> ${NAME}.crx (CRX v${crx.readUInt32LE(4)}, ${crx.length} bytes) + ${NAME}.zip`
);
