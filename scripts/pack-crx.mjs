#!/usr/bin/env node
/*
 * Assemble a clean runtime-only build of the extension and pack it into a
 * signed .crx (CRX3) plus a matching .zip. Pure JS — no browser needed.
 *
 *   node scripts/pack-crx.mjs
 *
 * Signing key resolution (first match wins):
 *   1. $CRX_KEY       — the private-key PEM itself (raw, or base64-encoded).
 *   2. $CRX_KEY_PATH  — path to a private-key PEM file.
 *   3. none           — generate an EPHEMERAL key (prints a warning; the crx
 *                       will have an unstable extension id).
 *
 * Outputs (git-ignored):
 *   dist/shabbat-closed-extension.crx
 *   dist/shabbat-closed-extension.zip
 */
import crx3 from "crx3";
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import {
  writeFileSync, readFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const build = join(dist, "build");
const NAME = "shabbat-closed-extension";

// Runtime files that ship in the extension (mirrors the store zip).
const INCLUDE = [
  "manifest.json",
  "icons",
  "data/sites.js",
  "data/sites.json",
  "src",
  "README.md",
];

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

function walk(dir, base) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = base ? base + "/" + name : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out;
}

// --- assemble clean build dir ---------------------------------------------
rmSync(dist, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
for (const item of INCLUDE) {
  cpSync(join(root, item), join(build, item), { recursive: true });
}

// --- key ------------------------------------------------------------------
const { pem, ephemeral } = resolveKeyPem();
const keyPath = join(dist, "key.pem");
writeFileSync(keyPath, pem);
if (ephemeral) {
  console.warn(
    "! No CRX_KEY / CRX_KEY_PATH provided — using an EPHEMERAL key.\n" +
    "  The .crx will have an unstable extension id. Set the CRX_KEY secret for releases."
  );
}
console.log("extension id:", extensionId(pem));

// --- pack -----------------------------------------------------------------
const crxPath = join(dist, `${NAME}.crx`);
const zipPath = join(dist, `${NAME}.zip`);
const files = walk(build);

process.chdir(build);
await crx3(files, { keyPath, crxPath, zipPath });

const crx = readFileSync(crxPath);
const magic = crx.subarray(0, 4).toString("ascii");
if (magic !== "Cr24") throw new Error("bad crx magic: " + magic);
console.log(
  `packed ${files.length} files -> ${NAME}.crx (CRX v${crx.readUInt32LE(4)}, ${crx.length} bytes) + ${NAME}.zip`
);
