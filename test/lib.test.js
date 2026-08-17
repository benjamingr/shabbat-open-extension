import test from "node:test";
import assert from "node:assert/strict";
import "../src/lib.js";

const L = globalThis.ShabbatLib;

test("getShabbatWindow: Friday night in Israel is active", () => {
  const w = L.getShabbatWindow(new Date("2026-08-14T17:00:00Z"), 30, 40);
  assert.equal(w.active, true);
});

test("getShabbatWindow: Saturday midday is active", () => {
  const w = L.getShabbatWindow(new Date("2026-08-15T12:00:00Z"), 30, 40);
  assert.equal(w.active, true);
});

test("getShabbatWindow: a weekday is not active", () => {
  const w = L.getShabbatWindow(new Date("2026-08-12T10:00:00Z"), 30, 40);
  assert.equal(w.active, false);
});

test("getShabbatWindow: after havdalah rolls to the upcoming Shabbat", () => {
  const now = new Date("2026-08-15T19:00:00Z"); // Sat night, after ~17:03Z end
  const w = L.getShabbatWindow(now, 30, 40);
  assert.equal(w.active, false);
  assert.ok(w.start > now, "start should be next Friday, not last Friday");
});

test("matchSite: exact, subdomain, www-normalized, and miss", () => {
  const sites = [{ domain: "foo.co.il" }, { domain: "bar.com" }];
  assert.equal(L.matchSite("foo.co.il", sites).domain, "foo.co.il");
  assert.equal(L.matchSite("shop.foo.co.il", sites).domain, "foo.co.il");
  assert.equal(L.matchSite("www.bar.com", sites).domain, "bar.com");
  assert.equal(L.matchSite("baz.com", sites), null);
});

test("normalizeHost strips www and trailing dot, lowercases", () => {
  assert.equal(L.normalizeHost("www.Example.COM."), "example.com");
});

test("meetsConfidence ranks verified > high > medium", () => {
  assert.equal(L.meetsConfidence({ confidence: "verified" }, "high"), true);
  assert.equal(L.meetsConfidence({ confidence: "high" }, "high"), true);
  assert.equal(L.meetsConfidence({ confidence: "medium" }, "high"), false);
});

test("isStrong: closure vs declaration", () => {
  assert.equal(L.isStrong({ status: "site_blocked" }), true);
  assert.equal(L.isStrong({ status: "operations_paused" }), true);
  assert.equal(L.isStrong({ status: "declared_shabbat_observant" }), false);
});
