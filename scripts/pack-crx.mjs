#!/usr/bin/env node
/*
 * Pack a built extension into a signed .crx (CRX3) plus a matching .zip.
 *
 *   npm run build && npm run pack                 # dist/          -> the scoped build
 *   npm run build:allhosts && npm run pack:allhosts   # dist-allhosts/ -> the <all_urls> variant
 *
 * Packs the build directory as-is. It used to assemble its own from a hand-listed set of
 * root files (manifest.json, icons/, data/sites.js, src/), which was right when the repo
 * *was* the extension. Now Vite produces the runtime tree, so duplicating that list here
 * would be a second definition of "what ships" — one that goes stale silently.
 *
 * Output goes to release/, not into the build directory.
 *
 * Signing key resolution (first match wins):
 *   1. $CRX_KEY       — the private-key PEM itself (raw, or base64-encoded).
 *   2. $CRX_KEY_PATH  — path to a private-key PEM file.
 *   3. none           — generate an EPHEMERAL key (prints a warning; the crx
 *                       will have an unstable extension id).
 *
 * Given a real key, both variants are signed with it and so share one extension id (an
 * ephemeral key is generated per run, so that does not hold without CRX_KEY). That is
 * deliberate: installing one over the other is then an update rather than a second
 * extension, which is the only way to observe what Chrome does when host patterns change
 * between versions — the question the <all_urls> variant exists to answer. The cost is
 * that the two cannot be installed side by side, hence the very different filenames.
 *
 * Outputs (git-ignored):
 *   release/shabbat-closed-extension.crx           release/shabbat-closed-extension.zip
 *   release/shabbat-closed-extension-allhosts.crx  release/shabbat-closed-extension-allhosts.zip
 */
import crx3 from "crx3";
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import {
  writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");

const allHosts = process.argv.slice(2).includes("--all-hosts");
const distName = allHosts ? "dist-allhosts" : "dist";
const dist = join(root, distName);
// The suffix is the only thing separating a build that runs on 81 listed sites from one
// that runs everywhere. Worth being unmissable in a downloads list.
const NAME = allHosts ? "shabbat-closed-extension-allhosts" : "shabbat-closed-extension";

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
  const script = allHosts ? "npm run build:allhosts" : "npm run build";
  console.error(`${distName}/manifest.json not found — run \`${script}\` first.`);
  process.exit(1);
}

/*
 * Only this variant's own outputs are cleared, not the whole directory. Wiping release/
 * wholesale was fine while there was one build; now a release carries both, and the
 * second pack would silently delete the first one's artifacts.
 */
mkdirSync(release, { recursive: true });
for (const ext of ["crx", "zip"]) {
  rmSync(join(release, `${NAME}.${ext}`), { force: true });
}

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
  `packed ${files.length} files from ${distName}/ -> ${NAME}.crx ` +
  `(CRX v${crx.readUInt32LE(4)}, ${crx.length} bytes) + ${NAME}.zip`
);
