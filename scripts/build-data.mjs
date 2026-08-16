#!/usr/bin/env node
/*
 * Build step: derive the runtime data + content-script match patterns from the
 * human-editable dataset in data/sites.json.
 *
 * Produces:
 *   data/sites.js         — exposes globalThis.SHABBAT_DATA (loadable by both
 *                           content scripts and the service worker).
 *   manifest.json         — content_scripts[0].matches is regenerated so the
 *                           extension only runs on listed domains.
 *
 * Run: node scripts/build-data.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataJsonPath = join(root, "data", "sites.json");
const dataJsPath = join(root, "data", "sites.js");
const manifestPath = join(root, "manifest.json");

const raw = readFileSync(dataJsonPath, "utf8");
const data = JSON.parse(raw); // throws on malformed JSON — fail loudly

if (!Array.isArray(data.sites) || data.sites.length === 0) {
  throw new Error("data/sites.json has no sites[]");
}

// --- validate + collect domains ------------------------------------------
const seen = new Set();
const domains = [];
for (const site of data.sites) {
  const dom = String(site.domain || "").trim().toLowerCase().replace(/^www\./, "");
  if (!dom) throw new Error(`Site missing domain: ${JSON.stringify(site)}`);
  if (seen.has(dom)) {
    console.warn(`  ! duplicate domain skipped: ${dom}`);
    continue;
  }
  seen.add(dom);
  domains.push(dom);
}

// --- write data/sites.js --------------------------------------------------
const banner =
  "/* AUTO-GENERATED from data/sites.json by scripts/build-data.mjs. Do not edit. */\n";
const js =
  banner +
  "globalThis.SHABBAT_DATA = " +
  JSON.stringify(data, null, 2) +
  ";\n";
writeFileSync(dataJsPath, js);

// --- regenerate manifest match patterns -----------------------------------
const matches = [];
for (const dom of domains) {
  matches.push(`*://${dom}/*`);
  matches.push(`*://*.${dom}/*`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!manifest.content_scripts || !manifest.content_scripts[0]) {
  throw new Error("manifest.json is missing content_scripts[0]");
}
manifest.content_scripts[0].matches = matches;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Built: ${domains.length} domains -> data/sites.js + ${matches.length} match patterns in manifest.json`
);
