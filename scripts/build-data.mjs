#!/usr/bin/env node
/*
 * Validate data/sites.json — the repo's source of truth for the site list.
 *
 * There is nothing to generate any more: the runtime imports the JSON directly and
 * manifest.config.ts derives the content-script match patterns from it at build time.
 * What used to be a build step is now a gate, run by `npm run validate` (and by
 * `npm run build` before anything else), so a malformed dataset fails at the terminal
 * rather than silently shipping.
 *
 * Exits non-zero on any error.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitesPath = join(root, "data", "sites.json");

const STATUSES = new Set([
  "site_blocked",
  "purchase_blocked",
  "operations_paused",
  "declared_shabbat_observant",
]);
const CONFIDENCES = new Set(["verified", "high", "medium"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const data = JSON.parse(readFileSync(sitesPath, "utf8")); // throws on malformed JSON

if (!Array.isArray(data.sites) || data.sites.length === 0) {
  fail("data/sites.json has no sites[]");
}

const norm = (d) =>
  String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

const seen = new Map();
const domains = [];

for (const [i, site] of (data.sites ?? []).entries()) {
  const where = `sites[${i}]`;
  const domain = norm(site.domain);

  if (!domain) {
    fail(`${where}: missing domain`);
    continue;
  }
  if (!domain.includes(".")) fail(`${where} (${domain}): not a domain`);
  if (seen.has(domain)) {
    fail(`${where} (${domain}): duplicate of sites[${seen.get(domain)}]`);
    continue;
  }
  seen.set(domain, i);
  domains.push(domain);

  if (!site.name) fail(`${where} (${domain}): missing name`);
  if (!STATUSES.has(site.status)) fail(`${where} (${domain}): bad status "${site.status}"`);
  if (!CONFIDENCES.has(site.confidence)) {
    fail(`${where} (${domain}): bad confidence "${site.confidence}"`);
  }
  if (!site.evidence_text) fail(`${where} (${domain}): missing evidence_text`);
  if (!site.evidence_url) fail(`${where} (${domain}): missing evidence_url`);
  if (!ISO_DATE.test(String(site.verified))) {
    fail(`${where} (${domain}): verified must be YYYY-MM-DD, got "${site.verified}"`);
  }
  if (site.holidays !== null && typeof site.holidays !== "boolean") {
    fail(`${where} (${domain}): holidays must be true, false, or null`);
  }
}

/*
 * Matching is exact-or-subdomain, so a listed domain that sits under another listed
 * domain is unreachable — whichever comes first in the array always wins. Not fatal, but
 * it means one of the two entries never applies.
 */
for (const domain of domains) {
  const parent = domains.find((other) => other !== domain && domain.endsWith("." + other));
  if (parent) warn(`${domain} is shadowed by ${parent} — only one of them will ever match`);
}

// A domain in both sites[] and removed[] is a contradiction: listed and rejected at once.
for (const entry of data.removed ?? []) {
  const domain = norm(entry.domain);
  if (seen.has(domain)) fail(`${domain}: present in both sites[] and removed[]`);
  if (!entry.reason) fail(`removed ${domain}: missing reason`);
}

for (const w of warnings) console.warn(`  ! ${w}`);

if (errors.length > 0) {
  console.error(`\ndata/sites.json is invalid — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(
  `data/sites.json OK — ${domains.length} sites, ${(data.removed ?? []).length} removed, ` +
    `${domains.length * 2} match patterns.`,
);
