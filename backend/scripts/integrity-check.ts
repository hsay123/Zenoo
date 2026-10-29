/**
 * Operator CLI: run the duplicate-account / integrity check (HHG F6.2).
 *
 *   npm run integrity:check            # dry run: print findings, store nothing
 *   npm run integrity:check -- --store # also upsert flags into account_flags
 *
 * Uses TigerGraph when TIGERGRAPH_HOST + TIGERGRAPH_TOKEN are set, otherwise
 * the in-process engine (same rules). Prints account ids only, never emails.
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { getEnv } from "../lib/env";
import { detectIntegrityFlags, findLinks } from "../lib/integrity/graph";
import { loadIntegrityInput, runIntegrityCheck } from "../lib/integrity/service";
import { tigerGraphConfig, tigerGraphLinks } from "../lib/integrity/tigergraph";

async function main() {
  const env = getEnv();
  if (process.argv.includes("--store")) {
    console.log(JSON.stringify(await runIntegrityCheck(env), null, 2));
    return;
  }
  const input = await loadIntegrityInput();
  const tg = tigerGraphConfig(env);
  const links = tg ? await tigerGraphLinks(tg, input) : findLinks(input);
  const flags = detectIntegrityFlags(input, links);
  console.log(
    `engine=${tg ? "tigergraph" : "local"} accounts=${input.accounts.length} ` +
      `jobs=${input.jobs.length} submissions=${input.submissions.length} reviews=${input.reviews.length}`,
  );
  const bySignal: Record<string, number> = {};
  for (const f of flags) bySignal[f.signal] = (bySignal[f.signal] ?? 0) + 1;
  console.log(`flags=${flags.length} ${JSON.stringify(bySignal)} (dry run: nothing stored)`);
  for (const f of flags.slice(0, 20)) {
    console.log(`  ${f.signal.padEnd(15)} ${f.user_id} -> ${f.related_user_id ?? "(own job)"} ${JSON.stringify(f.evidence)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
