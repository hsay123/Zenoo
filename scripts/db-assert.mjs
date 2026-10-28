#!/usr/bin/env node
/**
 * Service-role DB assertions for the E2E loop (Phase 0.4).
 *
 * Reads backend/.env.local (names/values locally, never printed) and runs
 * read-only REST queries so the E2E specs can verify real rows exist.
 *
 * Usage:
 *   node scripts/db-assert.mjs counts
 *   node scripts/db-assert.mjs user <email>
 *   node scripts/db-assert.mjs job <jobId>
 *   node scripts/db-assert.mjs submissions <taskId>
 *   node scripts/db-assert.mjs receipts <submissionId>
 *   node scripts/db-assert.mjs query <table> [select] [key=value ...]
 *
 * Exit code 0 = assertion passed (rows found / counts printed); 3 = nothing found.
 */

import fs from "node:fs";
import path from "node:path";

const ENV_FILE = path.join("backend", ".env.local");

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
if (!BASE || !KEY) {
  console.error(`Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE}`);
  process.exit(1);
}

async function rest(pathname) {
  const res = await fetch(`${BASE}/rest/v1/${pathname}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${pathname} :: ${body}`);
  return JSON.parse(body);
}

const TABLES = [
  "users",
  "projects",
  "assets",
  "jobs",
  "tasks",
  "submissions",
  "reviews",
  "appeals",
  "receipts",
  "audit_samples",
];

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "counts": {
      for (const t of TABLES) {
        try {
          const rows = await rest(`${t}?select=id`);
          console.log(`${t.padEnd(18)} ${rows.length}`);
        } catch (e) {
          console.log(`${t.padEnd(18)} ERR ${String(e.message).slice(0, 80)}`);
        }
      }
      return;
    }
    case "user": {
      const rows = await rest(`users?select=id,email,role,status&email=eq.${encodeURIComponent(args[0])}`);
      console.log(JSON.stringify(rows, null, 2));
      process.exitCode = rows.length ? 0 : 3;
      return;
    }
    case "job": {
      const row = await rest(`jobs?select=id,title,status,project_id&id=eq.${args[0]}`);
      console.log(JSON.stringify(row, null, 2));
      process.exitCode = row.length ? 0 : 3;
      return;
    }
    case "submissions": {
      const rows = await rest(`submissions?select=id,task_id,version,payload_hash&task_id=eq.${args[0]}`);
      console.log(JSON.stringify(rows, null, 2));
      process.exitCode = rows.length ? 0 : 3;
      return;
    }
    case "receipts": {
      const rows = await rest(
        `receipts?select=id,submission_id,tx_hash,is_mock&submission_id=eq.${args[0]}`,
      );
      console.log(JSON.stringify(rows, null, 2));
      process.exitCode = rows.length ? 0 : 3;
      return;
    }
    case "query": {
      const [table, select = "id", ...filters] = args;
      const qs = [`select=${select}`, ...filters.map((f) => f.replace("=", "=eq."))];
      const rows = await rest(`${table}?${qs.join("&")}`);
      console.log(JSON.stringify(rows, null, 2));
      process.exitCode = rows.length ? 0 : 3;
      return;
    }
    default:
      console.error("Unknown command. See header for usage.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
