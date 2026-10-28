#!/usr/bin/env node
/**
 * Update zeno-web-app.vercel.app alias to latest successful
 * release/rc-integration Preview deployment.
 *
 * Usage: node scripts/update-zeno-web-app-alias.js
 *
 * Requires: Vercel CLI authenticated, project linked
 */

import { execSync } from "child_process";

const PROJECT = "zeno-web";
const BRANCH = "release/rc-integration";
const ALIAS = "zeno-web-app.vercel.app";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    console.error(e.stdout?.toString() || e.message);
    process.exit(1);
  }
}

function main() {
  console.log(`Finding latest successful Preview deployment for ${BRANCH}...`);

  // Get deployments list (JSON for parsing)
  const lsOutput = run(`vercel ls ${PROJECT} --json`);

  let deployments;
  try {
    const parsed = JSON.parse(lsOutput);
    deployments = parsed.deployments || parsed;
  } catch (e) {
    console.error("Failed to parse vercel ls output:", e.message);
    process.exit(1);
  }

  // Filter: Preview (target === null), Ready, matching branch
  const candidates = deployments.filter((d) => {
    const meta = d.meta || {};
    return (
      d.target === null &&
      d.state === "READY" &&
      meta.githubCommitRef === BRANCH
    );
  });

  if (candidates.length === 0) {
    console.error(`No successful Preview deployments found for branch ${BRANCH}`);
    process.exit(1);
  }

  // Sort by creation time (newest first)
  candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const latest = candidates[0];
  const deploymentUrl = latest.url;
  const createdAt = new Date(latest.createdAt).toISOString();

  console.log(`Latest deployment: ${deploymentUrl}`);
  console.log(`Created: ${createdAt}`);
  console.log(`Commit: ${latest.meta?.githubCommitSha?.slice(0, 8) || "unknown"}`);

  function checkUrl(url) {
    return run(`curl -sS -L -f -w "http=%{http_code}" -o /dev/null "${url}" --max-time 30`);
  }

  // Verify health before aliasing
  console.log(`Running health check on ${deploymentUrl}...`);
  const healthCheck = checkUrl(deploymentUrl);
  if (!healthCheck.includes("http=200")) {
    console.error(`Health check failed: ${healthCheck}`);
    process.exit(1);
  }
  console.log("Health check passed (HTTP 200)");

  // Verify platform rewrite works
  console.log("Verifying /platform/api/health rewrite...");
  const rewriteCheck = checkUrl(`${deploymentUrl}/platform/api/health`);
  if (!rewriteCheck.includes("http=200")) {
    console.error(`Rewrite check failed: ${rewriteCheck}`);
    process.exit(1);
  }
  console.log("Rewrite check passed (HTTP 200)");

  // Update alias using deployment URL
  console.log(`Updating alias ${ALIAS} -> ${deploymentUrl}...`);
  const aliasResult = run(`vercel alias set ${deploymentUrl} ${ALIAS} --scope yashlandge150-gmailcoms-projects`);
  console.log(aliasResult);

  // Final verification
  console.log("Verifying alias resolves correctly...");
  const finalCheck = run(`curl -sS -f -w "http=%{http_code}" -o /dev/null "https://${ALIAS}" --max-time 30`);
  if (!finalCheck.includes("http=200")) {
    console.error(`Final alias check failed: ${finalCheck}`);
    process.exit(1);
  }
  console.log(`✅ Alias ${ALIAS} successfully updated to latest ${BRANCH} deployment`);
}

main();