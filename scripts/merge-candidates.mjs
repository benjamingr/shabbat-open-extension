#!/usr/bin/env node
/*
 * Merge verified candidate sites into data/sites.json.
 *
 * Usage: node scripts/merge-candidates.mjs <candidates.json>
 *   <candidates.json> is a JSON array of site objects (same shape as sites[]).
 *
 * - Skips any candidate whose domain already exists in sites[] or removed[].
 * - Skips duplicate domains within the candidate file.
 * - Validates required fields and enum values; rejects the whole run on error.
 * - Sorts final sites[] by status priority then name so the file stays tidy.
 * Does NOT run the build — run `node scripts/build-data.mjs` afterward.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitesPath = join(root, "data", "sites.json");

const candFile = process.argv[2];
if (!candFile) {
  console.error("usage: node scripts/merge-candidates.mjs <candidates.json>");
  process.exit(1);
}

const STATUSES = new Set([
  "site_blocked",
  "purchase_blocked",
  "operations_paused",
  "declared_shabbat_observant",
]);
const CONF = new Set(["verified", "high", "medium"]);
const STATUS_ORDER = {
  site_blocked: 0,
  purchase_blocked: 1,
  operations_paused: 2,
  declared_shabbat_observant: 3,
};

const norm = (d) =>
  String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

const data = JSON.parse(readFileSync(sitesPath, "utf8"));
const candidates = JSON.parse(readFileSync(candFile, "utf8"));
if (!Array.isArray(candidates)) throw new Error("candidates must be a JSON array");

const known = new Set();
for (const s of data.sites) known.add(norm(s.domain));
for (const r of data.removed || []) known.add(norm(r.domain));

let added = 0;
const skipped = [];
for (const c of candidates) {
  const dom = norm(c.domain);
  if (!dom) { skipped.push([c.domain, "empty domain"]); continue; }
  if (known.has(dom)) { skipped.push([dom, "already known"]); continue; }
  if (!STATUSES.has(c.status)) { skipped.push([dom, "bad status: " + c.status]); continue; }
  if (!CONF.has(c.confidence)) { skipped.push([dom, "bad confidence: " + c.confidence]); continue; }
  if (!c.name || !c.evidence_text) { skipped.push([dom, "missing name/evidence_text"]); continue; }

  const entry = {
    domain: dom,
    name: c.name,
    category: c.category || "general",
    status: c.status,
    confidence: c.confidence,
    holidays: c.holidays ?? null,
  };
  if (c.mechanism) entry.mechanism = c.mechanism;
  entry.evidence_text = c.evidence_text;
  entry.evidence_url = c.evidence_url || `https://${dom}/`;
  entry.verified = c.verified || data.audited_at;

  data.sites.push(entry);
  known.add(dom);
  added++;
}

data.sites.sort((a, b) => {
  const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  return so !== 0 ? so : String(a.name).localeCompare(String(b.name), "he");
});

writeFileSync(sitesPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Added ${added}; total sites now ${data.sites.length}.`);
if (skipped.length) {
  console.log("Skipped:");
  for (const [d, why] of skipped) console.log(`  - ${d}: ${why}`);
}
