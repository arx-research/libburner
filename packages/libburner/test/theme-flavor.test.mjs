// SKU -> product flavour lookup. This decides which Burner app a tag belongs
// to, and burner-app redirects across domains on the result, so a wrong answer
// sends a user to the wrong product. Runs against the built ESM: `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FullThemes,
  findFlavorBySKU,
  findTheme,
  latchDecoder,
} from "../lib.esm/burnerTagData/index.js";

const VALID_FLAVORS = new Set(["BurnerETH", "BurnerBTC", "BurnerSOL"]);

test("every theme declares a flavour", () => {
  for (const [key, theme] of Object.entries(FullThemes)) {
    assert.ok("flavor" in theme, `${key} (${theme.sku}) is missing flavor`);
    assert.ok(
      theme.flavor === null || VALID_FLAVORS.has(theme.flavor),
      `${key} (${theme.sku}) has invalid flavor ${JSON.stringify(theme.flavor)}`
    );
  }
});

test("ids and skus are unique across the map", () => {
  const themes = Object.values(FullThemes);
  assert.equal(new Set(themes.map((t) => t.id)).size, themes.length);
  assert.equal(new Set(themes.map((t) => t.sku)).size, themes.length);
});

test("declared flavours resolve", () => {
  assert.equal(findFlavorBySKU("brnrbtca25b-orange"), "BurnerBTC");
  assert.equal(findFlavorBySKU("brnr128a26d-solana"), "BurnerSOL");
  assert.equal(findFlavorBySKU("brnrsola26u-ultraviolet"), "BurnerSOL");
  assert.equal(findFlavorBySKU("brnr128a25c-nouns"), "BurnerETH");
  assert.equal(findFlavorBySKU("brnreth26oz-sapphire"), "BurnerETH");
});

test("a SKU's prefix does not decide its flavour", () => {
  // Same brnr128a26d batch, different chains. This is the case that broke
  // prefix-based inference and motivated the flavor field.
  assert.equal(findFlavorBySKU("brnr128a26d-solana"), "BurnerSOL");
  assert.equal(findFlavorBySKU("brnr128a26d-frost"), "BurnerETH");
});

test("custom themes are known but deliberately unroutable", () => {
  for (const sku of ["custom1", "custom2", "custom3", "custom4", "custom5", "custom6"]) {
    assert.equal(findFlavorBySKU(sku), null, `${sku} should be null, not undefined`);
  }
});

test("an unknown SKU is undefined, not null and not a default", () => {
  // Callers use undefined to mean "this tag may be newer than the installed
  // libburner" and fall back to naming conventions. Collapsing it into null
  // would strand such tags; collapsing it into a flavour would misroute them.
  assert.equal(findFlavorBySKU("brnr128a99z-notyet"), undefined);
  assert.equal(findFlavorBySKU("wat"), undefined);
  assert.equal(findFlavorBySKU(""), undefined);
  assert.equal(findFlavorBySKU(null), undefined);
  assert.equal(findFlavorBySKU(undefined), undefined);
});

test("findFlavorBySKU does not inherit findTheme's default-theme fallback", () => {
  // findTheme resolves a miss to FullThemes['1'] (acid, an ETH theme).
  // Routing off that would make every unknown SKU look like BurnerETH.
  assert.equal(findTheme("brnr128a99z-notyet").sku, "brnr128a24a-acid");
  assert.equal(findFlavorBySKU("brnr128a99z-notyet"), undefined);
});

test("lookup matches on sku only, not id, nickname or colour", () => {
  const solana = Object.values(FullThemes).find((t) => t.sku === "brnr128a26d-solana");
  assert.equal(findFlavorBySKU(solana.id), undefined);
  assert.equal(findFlavorBySKU(solana.nickname), undefined);
  assert.equal(findFlavorBySKU(solana.color), undefined);
});

test("latch2 on a real tag round-trips to a flavour", () => {
  // Tags store the SKU with a dot; latchDecoder rewrites it to a dash.
  const latch2 = Buffer.from("brnr128a26d.solana", "ascii").toString("hex").padEnd(64, "0");
  const sku = latchDecoder(latch2);
  assert.equal(sku, "brnr128a26d-solana");
  assert.equal(findFlavorBySKU(sku), "BurnerSOL");
  assert.equal(findTheme(sku).nickname, "dsc-solana");

  const uv = latchDecoder(
    Buffer.from("brnrsola26u.ultraviolet", "ascii").toString("hex").padEnd(64, "0")
  );
  assert.equal(uv, "brnrsola26u-ultraviolet");
  assert.equal(findFlavorBySKU(uv), "BurnerSOL");
  assert.equal(findTheme(uv).nickname, "ultraviolet");
});

test("both Solana SKUs are declared, on different prefixes", () => {
  // The two Solana cards do not share a prefix: brnr128a26d-solana is the DSC
  // edition on brnr128 hardware, brnrsola26u-ultraviolet is the native brnrsol
  // line. Prefix matching cannot cover both without also claiming every other
  // brnr128 card, which is the whole reason flavour is declared.
  assert.equal(findFlavorBySKU("brnr128a26d-solana"), "BurnerSOL");
  assert.equal(findFlavorBySKU("brnrsola26u-ultraviolet"), "BurnerSOL");
  assert.equal(findFlavorBySKU("brnr128a26d-frost"), "BurnerETH");
});

test("theme ids stay single characters", () => {
  // graffitiDecoder reads the theme id as graffiti[length - 4], one character.
  // A multi-character id would silently resolve to the wrong theme.
  for (const [key, theme] of Object.entries(FullThemes)) {
    assert.equal(theme.id.length, 1, `${key} (${theme.sku}) has a multi-char id`);
    assert.equal(key, theme.id, `${key} is keyed differently from its id`);
  }
});

test("one BTC and two SOL SKUs today", () => {
  const counts = {};
  for (const t of Object.values(FullThemes)) {
    counts[String(t.flavor)] = (counts[String(t.flavor)] || 0) + 1;
  }
  assert.equal(counts.BurnerBTC, 1);
  assert.equal(counts.BurnerSOL, 2);
  assert.equal(counts.null, 6);
});
