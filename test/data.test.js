import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "../data/sites.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = JSON.parse(readFileSync(join(root, "data/sites.json"), "utf8"));

const STATUS = new Set([
  "site_blocked",
  "purchase_blocked",
  "operations_paused",
  "declared_shabbat_observant",
]);
const CONF = new Set(["verified", "high", "medium"]);

test("sites.json entries are well-formed", () => {
  assert.ok(Array.isArray(json.sites) && json.sites.length > 0);
  for (const s of json.sites) {
    assert.ok(s.domain, "missing domain");
    assert.ok(s.name, "missing name: " + s.domain);
    assert.ok(STATUS.has(s.status), "bad status: " + s.domain);
    assert.ok(CONF.has(s.confidence), "bad confidence: " + s.domain);
    assert.ok(s.evidence_text, "missing evidence_text: " + s.domain);
    assert.ok(s.evidence_url, "missing evidence_url: " + s.domain);
  }
});

test("no duplicate domains", () => {
  const seen = new Set();
  for (const s of json.sites) {
    const d = s.domain.toLowerCase();
    assert.ok(!seen.has(d), "duplicate domain: " + d);
    seen.add(d);
  }
});

test("generated data/sites.js is in sync with sites.json", () => {
  assert.deepEqual(globalThis.SHABBAT_DATA.sites, json.sites);
});

test("manifest content-script matches are generated from the site list", () => {
  const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const matches = m.content_scripts[0].matches;
  const domains = [
    ...new Set(json.sites.map((s) => s.domain.toLowerCase().replace(/^www\./, ""))),
  ];
  assert.equal(matches.length, domains.length * 2, "one exact + one wildcard per domain");
  for (const d of domains) {
    assert.ok(matches.includes(`*://${d}/*`), "missing match for " + d);
    assert.ok(matches.includes(`*://*.${d}/*`), "missing wildcard match for " + d);
  }
});

test("manifest has icons and a matching version", () => {
  const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(m.manifest_version, 3);
  assert.ok(/^\d+\.\d+\.\d+$/.test(m.version), "semver-ish version");
  for (const size of ["16", "32", "48", "128"]) {
    assert.ok(m.icons[size], "missing icon " + size);
  }
});
