/* eslint-disable no-console */
/**
 * Credential-freshness circuit build pipeline.
 *
 *   1. Compile   circuits/src/credential_freshness.circom → build/{r1cs, wasm}
 *   2. Setup     Groth16 ceremony (Hermez ptau 14 download + zkey setup + contribute)
 *   3. Export    verification_key.json + Solidity verifier contract
 *   4. Publish   artefacts to contracts/ + frontend/public/freshness/
 *
 * On Windows, `circom` runs via WSL. Everything else (snarkjs) runs in Node natively.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "credential_freshness.circom");
const BUILD = path.join(ROOT, "build");
const R1CS = path.join(BUILD, "credential_freshness.r1cs");
const SYM = path.join(BUILD, "credential_freshness.sym");
const WASM_DIR = path.join(BUILD, "credential_freshness_js");
const WASM = path.join(WASM_DIR, "credential_freshness.wasm");
const PTAU = path.join(BUILD, "powersOfTau28_hez_final_14.ptau");
const ZKEY_0 = path.join(BUILD, "freshness_0000.zkey");
const ZKEY_FINAL = path.join(BUILD, "freshness_final.zkey");
const VKEY = path.join(BUILD, "verification_key.json");

const CIRCOMLIB = path.resolve(ROOT, "..", "contracts", "node_modules", "circomlib", "circuits");
const VERIFIER_OUT = path.resolve(ROOT, "..", "contracts", "contracts", "freshness", "FreshnessVerifier.sol");
const FRONTEND_PUB = path.resolve(ROOT, "..", "frontend", "public", "freshness");

const PTAU_URL = "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau";
const IS_WINDOWS = process.platform === "win32";

function toWslPath(winPath) {
  const normalized = winPath.replace(/\\/g, "/");
  if (!/^[A-Za-z]:/.test(normalized)) return normalized;
  const drive = normalized[0].toLowerCase();
  return `/mnt/${drive}${normalized.slice(2)}`;
}

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function runCircom(args) {
  if (IS_WINDOWS) {
    // Invoke circom inside WSL, paths translated to /mnt/c/...
    const wslArgs = args.map((a) => (path.isAbsolute(a) ? toWslPath(a) : a)).join(" ");
    run(`wsl -- bash -c 'export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH" && circom ${wslArgs}'`);
  } else {
    run(`circom ${args.join(" ")}`);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function download(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`Reusing ${path.basename(dest)}`);
    return;
  }
  console.log(`Downloading ${url} → ${dest}`);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https
        .get(u, (res) => {
          if ((res.statusCode === 302 || res.statusCode === 301) && res.headers.location) {
            res.resume();
            return request(res.headers.location);
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    };
    request(url);
  });
}

async function main() {
  ensureDir(BUILD);
  ensureDir(FRONTEND_PUB);
  ensureDir(path.dirname(VERIFIER_OUT));

  console.log("=== 1/4 Compile circuit ===");
  runCircom([
    SRC,
    "--r1cs",
    "--wasm",
    "--sym",
    "--output",
    BUILD,
    "-l",
    CIRCOMLIB,
  ]);

  console.log("\n=== 2/4 Powers of Tau (Hermez ptau 14) ===");
  await download(PTAU_URL, PTAU);

  console.log("\n=== 3/4 Groth16 ceremony ===");
  // Initial setup from r1cs + ptau
  run(`npx --yes snarkjs groth16 setup "${R1CS}" "${PTAU}" "${ZKEY_0}"`);
  // Contribute a single random entropy (acceptable for hackathon testnet)
  const entropy = `${Date.now()}-hsk-passport-freshness`;
  run(`npx --yes snarkjs zkey contribute "${ZKEY_0}" "${ZKEY_FINAL}" --name="hsk-passport-freshness" -e="${entropy}"`);
  run(`npx --yes snarkjs zkey export verificationkey "${ZKEY_FINAL}" "${VKEY}"`);

  console.log("\n=== 4/4 Solidity verifier + frontend artefacts ===");
  run(`npx --yes snarkjs zkey export solidityverifier "${ZKEY_FINAL}" "${VERIFIER_OUT}"`);

  // Patch: auto-generated verifier uses `Groth16Verifier` but our interface expects
  // a more specific name. Rename contract to FreshnessVerifier to avoid collision with
  // any other Groth16Verifier contracts in the project.
  let src = fs.readFileSync(VERIFIER_OUT, "utf8");
  src = src.replace(/contract\s+Groth16Verifier/g, "contract FreshnessVerifier");
  // snarkjs emits `pragma solidity ^0.8.0;` — align with rest of project.
  src = src.replace(/pragma\s+solidity\s+[^;]+;/, "pragma solidity >=0.8.23 <0.9.0;");
  fs.writeFileSync(VERIFIER_OUT, src);

  // Copy wasm + zkey to frontend public so browser-side proving can fetch them.
  fs.copyFileSync(WASM, path.join(FRONTEND_PUB, "credential_freshness.wasm"));
  fs.copyFileSync(ZKEY_FINAL, path.join(FRONTEND_PUB, "credential_freshness.zkey"));
  fs.copyFileSync(VKEY, path.join(FRONTEND_PUB, "verification_key.json"));

  console.log("\nBuild complete.");
  console.log(`  r1cs:      ${R1CS}`);
  console.log(`  wasm:      ${WASM}`);
  console.log(`  zkey:      ${ZKEY_FINAL}`);
  console.log(`  verifier:  ${VERIFIER_OUT}`);
  console.log(`  frontend:  ${FRONTEND_PUB}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
