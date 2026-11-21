#!/usr/bin/env node
/*
 * Assert that a dataset edit bumped `revision`.
 *
 * `revision` is the only thing a running extension compares to decide whether a fetched
 * copy of data/sites.json is newer than the one it already has (see src/lib/remote.ts).
 * An edit that leaves it alone still validates, still builds, still ships to the store —
 * and never reaches a single existing install. There is no symptom to notice, which is
 * why this is a CI gate rather than a review habit.
 *
 * Run: node scripts/check-revision.mjs [base-ref]   (default: origin/main)
 *
 * Passes when the dataset is unchanged against the base ref, or when it changed and the
 * revision went up. Passes silently when the base ref has no dataset yet — that is a new
 * branch, not a regression.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "origin/main";

const head = JSON.parse(readFileSync(join(root, "data", "sites.json"), "utf8"));

const show = spawnSync("git", ["show", `${base}:data/sites.json`], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (show.status !== 0) {
  console.log(`No data/sites.json at ${base} — nothing to compare against.`);
  process.exit(0);
}

const previous = JSON.parse(show.stdout);

/**
 * Deep key-sort, so re-serialising the file with keys in a different order does not read
 * as a content change. Note this cannot be done with a `JSON.stringify` replacer array:
 * that filters keys at every level, which would reduce each site object to `{}`.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

/** Everything except the revision itself — that is the field being asserted about. */
function content(data) {
  const { revision: _revision, ...rest } = data;
  return JSON.stringify(canonical(rest));
}

if (content(head) === content(previous)) {
  console.log(`data/sites.json is unchanged against ${base} (revision ${head.revision}).`);
  process.exit(0);
}

// A base ref predating the field at all: anything numeric is an increase over nothing.
const before = Number.isInteger(previous.revision) ? previous.revision : -1;

if (!(head.revision > before)) {
  console.error(
    `\ndata/sites.json changed against ${base} but revision did not increase ` +
      `(${before} → ${head.revision}).\n\n` +
      `  Every install compares this number to decide whether to accept the update.\n` +
      `  Leaving it flat ships the edit to the store and to nobody else.\n\n` +
      `  Fix: set "revision" in data/sites.json to ${before + 1} or higher.\n`,
  );
  process.exit(1);
}

console.log(
  `data/sites.json changed against ${base} and revision went ${before} → ${head.revision}.`,
);
