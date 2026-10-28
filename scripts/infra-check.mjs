#!/usr/bin/env node
/**
 * Infra readiness check (Phase 0 / Phase 4).
 *
 * Reads backend/.env.local (values never printed) and verifies the real
 * prerequisites for E2E: public tables, the private media bucket, and whether
 * any Privy/auth users exist. Prints a compact PASS/FAIL summary.
 *
 * Usage: node scripts/infra-check.mjs        (report only)
 *        node scripts/infra-check.mjs --ensure-bucket   (create `media` if missing)
 */

import fs from "node:fs";

const ENV_FILE = "backend/.env.local";
const REQUIRED_TABLES = [
  "users",
  "projects",
  "assets",
  "jobs",
  "tasks",
  "submissions",
  "reviews",
  "appeals",
  "receipts",
];

function loadEnv() {
  const text = fs.readFileSync(ENV_FILE, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const BASE = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.SUPABASE_STORAGE_BUCKET || "media";
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

if (!BASE || !KEY) {
  console.error(`Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE}`);
  process.exit(1);
}

const ensureBucket = process.argv.includes("--ensure-bucket");

async function main() {
  let failures = 0;

  const openapi = await fetch(`${BASE}/rest/v1/`, { headers: auth });
  const spec = await openapi.json().catch(() => ({}));
  const tables = Object.keys(spec.paths ?? {})
    .filter((p) => !p.includes("{") && p !== "/")
    .map((p) => p.replace(/^\//, ""));

  const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
  if (missing.length === 0) {
    console.log(`PASS tables        all ${REQUIRED_TABLES.length} required tables present`);
  } else {
    failures++;
    console.log(`FAIL tables        missing: ${missing.join(", ")}`);
  }

  let bucketsJson = await (await fetch(`${BASE}/storage/v1/bucket`, { headers: auth })).json().catch(() => []);
  let hasBucket = Array.isArray(bucketsJson) && bucketsJson.some((b) => b.name === BUCKET);
  if (!hasBucket && ensureBucket) {
    const cr = await fetch(`${BASE}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    });
    bucketsJson = await (await fetch(`${BASE}/storage/v1/bucket`, { headers: auth })).json().catch(() => []);
    hasBucket = bucketsJson.some?.((b) => b.name === BUCKET) ?? false;
    console.log(`     bucket        create ${BUCKET}: HTTP ${cr.status}`);
  }
  if (hasBucket) {
    console.log(`PASS bucket        '${BUCKET}' exists${JSON.stringify(bucketsJson).includes('"public":false') ? " (private)" : ""}`);
  } else {
    failures++;
    console.log(`FAIL bucket        '${BUCKET}' missing (re-run with --ensure-bucket)`);
  }

  const usersRes = await fetch(`${BASE}/auth/v1/admin/users?per_page=20`, { headers: auth });
  const users = await usersRes.json().catch(() => ({}));
  const count = Array.isArray(users.users) ? users.users.length : 0;
  if (count > 0) {
    console.log(`INFO auth users    ${count}: ${users.users.map((u) => u.email || u.id).join(", ")}`);
  } else {
    console.log("WARN auth users    none (log in via Privy to create the first user)");
  }

  console.log(failures === 0 ? "\nINFRA READY" : `\nINFRA NOT READY (${failures} blocker(s))`);
  process.exit(failures === 0 ? 0 : 3);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
