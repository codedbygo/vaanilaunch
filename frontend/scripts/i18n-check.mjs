#!/usr/bin/env node
// i18n gate. Reads the DECLARED locale list (src/lib/i18n/supported.json), never the directory,
// so deleting a whole catalog fails. Fails on: a listed locale without a catalog, zero keys,
// a key missing from any catalog, placeholders that differ from English, a plural set missing
// "one" or "other", or code that looks up a key English lacks.
// --release also fails while any key awaits translation (listed in worklist.json).
// Usage: node scripts/i18n-check.mjs [--release] [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const release = args.includes("--release");
const rootArg = args.indexOf("--root");
const root = rootArg === -1 ? new URL("..", import.meta.url).pathname : args[rootArg + 1];
const dir = join(root, "src/lib/i18n");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const errors = [];
const supported = readJson(join(dir, "supported.json"));
const DEFAULT = "en-IN";
const catalogs = {};
for (const loc of supported) {
  const file = join(dir, "catalogs", `${loc}.json`);
  if (!existsSync(file)) errors.push(`${loc}: catalog file missing (${file})`);
  else catalogs[loc] = readJson(file);
}
const en = catalogs[DEFAULT] ?? {};
const keys = Object.keys(en);
if (keys.length === 0) errors.push("0 keys compared: the English catalog is empty or missing");

const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");
let missing = 0;
let mismatches = 0;
for (const [loc, cat] of Object.entries(catalogs)) {
  for (const k of keys) {
    if (!(k in cat)) {
      missing++;
      errors.push(`${loc}: missing key ${k}`);
    } else if (placeholders(cat[k]) !== placeholders(en[k])) {
      mismatches++;
      errors.push(
        `${loc}: ${k} has {${placeholders(cat[k])}}, English has {${placeholders(en[k])}}`,
      );
    }
  }
}

// Plural sets: every language here (en and the 8 Indian ones) uses CLDR "one" and "other".
for (const k of keys.filter((k) => /\.(one|other)$/.test(k))) {
  const base = k.replace(/\.(one|other)$/, "");
  for (const cat of ["one", "other"]) {
    if (!(`${base}.${cat}` in en)) errors.push(`${DEFAULT}: plural ${base} lacks "${cat}"`);
  }
}

// Literal lookups in the code: t("x"), tp("x"), translate(locale, "x").
function walk(d, out = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const used = new Set();
for (const file of walk(join(root, "src"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(
    /\b(t|tp|translate|translatePlural)\(\s*(?:[\w.]+,\s*)?"([\w.-]+)"/g,
  )) {
    const key = m[1].startsWith("tp") || m[1] === "translatePlural" ? `${m[2]}.other` : m[2];
    used.add(key);
    if (!(key in en)) errors.push(`${file.replace(root, "")}: looks up unknown key "${m[2]}"`);
  }
  // Keys passed around as typed values (MessageKey arrays, ternaries, maps) count as used too.
  for (const m of src.matchAll(/"([a-z]+(?:\.[\w-]+)+)"/g)) if (m[1] in en) used.add(m[1]);
}
// Keys built from data (tool names, order status, speech error codes, milestone keys) are typed
// in the code; they count as used through their prefix.
const DYNAMIC =
  /^(tool|checklist|features|order\.status|speech\.error|timeline\.status|milestone\.\w+\.(label|by)|examples\.(launch|manage)|hero\.stat\d|how\.\w+|trust\.\w+|demo\.\w+)\b/;
const unused = keys.filter((k) => !used.has(k) && !DYNAMIC.test(k) && !k.endsWith(".one"));

const worklistFile = join(dir, "worklist.json");
const worklist = existsSync(worklistFile) ? readJson(worklistFile) : {};
let awaiting = 0;
let drafts = 0;
for (const loc of supported.filter((l) => l !== DEFAULT)) {
  const entry = worklist[loc] ?? {};
  awaiting += (entry.needsTranslation ?? []).length;
  if (entry.status === "machine-draft") drafts++;
}

console.log(
  `i18n-check: ${keys.length} keys, ${supported.length} locales, ${missing} missing, ` +
    `${mismatches} placeholder mismatches, ${awaiting} awaiting translation, ${unused.length} unused` +
    (drafts ? ` (${drafts} locales are machine drafts awaiting native review)` : ""),
);
if (unused.length) console.log(`  unused: ${unused.join(", ")}`);
for (const e of errors) console.error(`  ✗ ${e}`);
if (release && awaiting > 0) console.error(`  ✗ release: ${awaiting} keys still await translation`);
process.exit(errors.length || (release && awaiting > 0) ? 1 : 0);
