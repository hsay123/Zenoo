#!/usr/bin/env node
/**
 * Ensures a local HTTPS certificate exists for `next dev --experimental-https`.
 *
 * Why HTTPS: Sign-In with Ethereum's `domain` field is scheme-less
 * (`window.location.host`), and ERC-4361 says a missing scheme defaults to
 * `https`. Brave Wallet enforces that, so an `http://localhost` origin is
 * reported as a domain mismatch and external-wallet login fails. Serving the
 * dev app over HTTPS makes the app origin match the wallet's expectation.
 *
 * Prefers `mkcert` (its CA can be trusted later with `sudo mkcert -install`,
 * which removes the browser warning); falls back to a plain openssl
 * self-signed certificate. The files live in `certificates/` and are
 * gitignored — never commit them.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = path.join(process.cwd(), "certificates");
const KEY = path.join(DIR, "localhost-key.pem");
const CERT = path.join(DIR, "localhost.pem");
const HOSTS = ["localhost", "127.0.0.1", "::1"];

if (fs.existsSync(KEY) && fs.existsSync(CERT)) {
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });

function findMkcert() {
  const candidates = [
    process.env.MKCERT,
    path.join(os.homedir(), ".cache/mkcert/mkcert-v1.4.4-linux-amd64"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  try {
    return execFileSync("which", ["mkcert"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function generateWithMkcert() {
  const mkcert = findMkcert();
  if (!mkcert) return false;
  try {
    fs.chmodSync(mkcert, 0o755);
  } catch {
    /* best effort */
  }
  try {
    execFileSync(mkcert, ["-key-file", KEY, "-cert-file", CERT, ...HOSTS], {
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

function generateWithOpenssl() {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      KEY,
      "-out",
      CERT,
      "-days",
      "825",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
    ],
    { stdio: "inherit" },
  );
}

if (!generateWithMkcert()) {
  generateWithOpenssl();
}

console.log(`Dev HTTPS certificate ready in ${path.relative(process.cwd(), DIR)}/ (gitignored).`);
if (!fs.existsSync(path.join(os.homedir(), ".local/share/mkcert/rootCA.pem"))) {
  console.log("Self-signed certificate: your browser will warn once per session.");
}
