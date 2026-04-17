# HSK Passport — Demo Video Script

**Target length:** 2:45 — 3:00 minutes
**Resolution:** 1080p, 30fps
**Format:** Screen recording with voiceover (no face cam needed)
**Anchors:** Composer (the adoption moat) + v6 per-prover ZK freshness (the technical moat)

---

## Setup checklist (run before recording)

- [ ] Open a fresh **Chrome incognito window**
- [ ] Install MetaMask in the incognito window only (no other extensions)
- [ ] Create a brand-new MetaMask account labeled "demo"
- [ ] Fund with HashKey testnet HSK from <https://faucet.hsk.xyz>
- [ ] Switch MetaMask to **HashKey Chain testnet**
- [ ] In DevTools console: `localStorage.clear()` then close DevTools
- [ ] Open <https://hskpassport.gudman.xyz> in the tab
- [ ] Have a second terminal tab ready: `ssh root@75.119.153.252 "journalctl -u hsk-passport-api -f"` showing live backend logs
- [ ] Have a third Blockscout tab ready: <https://hashkey-testnet.blockscout.com/address/0xFF790dE1537a84220cD12ef648650034D4725fBb> (HSKPassportFreshness contract) — for showing the v6 on-chain verify event
- [ ] Open OBS or screen recorder, set capture region to just the browser window (hide MetaMask popups in corner)
- [ ] Test audio levels — speak naturally, headset mic recommended

---

## Script (with timing + visuals)

### 00:00 — 00:15 — Hook (15 sec)

**On screen:** Homepage hero (<https://hskpassport.gudman.xyz/>)

**Voiceover:**
> "Every regulated dApp on HashKey Chain — silver-backed RWAs, tokenized funds, accredited DeFi — needs KYC. Today every team rebuilds it from scratch and leaks identity on-chain. HSK Passport is the compliance layer that fixes both."

**Visual:** Slow scroll showing the hero badge (*v6 live · 74 tests · real Sumsub + ZK freshness*), the metric row (5 / 16 / 74 / 0), and the standards strip. Emphasize the badge text.

---

### 00:15 — 00:45 — The Composer is the adoption moat (30 sec)

**On screen:** Navigate to `/composer`

**Voiceover:**
> "Here's what makes HSK Passport adoptable. Any dApp builder picks compliance rules — KYC, accredited investor, jurisdictions — and we generate the Solidity contract, React gate component, and Hardhat test."

**Visual:**
1. Click the **"APAC Regional RWA"** preset card → all the checkboxes flip on, dApp name updates
2. Right-hand code panels regenerate live with the new policy
3. Scroll to the generated Solidity contract — point at the `gatedAction` function with caller-bound proof + KYC check + jurisdiction set proof
4. Click "Copy" on the Solidity block

**Voiceover continues:**
> "Tick a preset. Copy the code. You just integrated KYC plus jurisdiction gating into your dApp in thirty seconds. That's the inevitability — compliance you can copy-paste."

---

### 00:45 — 01:15 — Real Sumsub, real webhook (30 sec)

**On screen:** Navigate to `/kyc`

**Voiceover:**
> "Now from the user side. We use Sumsub — the same regulated KYC provider HashKey Exchange uses. Most other ZKID submissions simulate KYC. We actually wire it."

**Visual:**
1. Click "Connect & Create Identity" — wallet signature popup, sign
2. Sumsub widget loads (the SANDBOX MODE badge is visible — be honest)
3. Use Sumsub sandbox test applicant — any fake passport, sandbox auto-approves in seconds
4. Cut to the terminal tab → `[sumsub] webhook applicantReviewed GREEN externalUserId=...`
5. Then → `[auto-issuer] issuing credential for commitment ...`
6. Cut to Blockscout tab showing the on-chain `CredentialIssued` event

**Voiceover continues:**
> "Sumsub fires the webhook. HSK Passport verifies the HMAC over the raw bytes — that's a real audit-round-three fix, not security theater. The auto-issuer mints the credential on-chain. Zero documents touch our servers."

---

### 01:15 — 02:00 — v6 per-prover ZK freshness — the technical moat (45 sec)

**On screen:** Navigate to `/demo/fresh` (click "Fresh ZK · v6" in the nav)

**Voiceover:**
> "Here's where we stop following the zkID playbook and build something no other submission has. Every ZK identity protocol I've seen either ignores credential expiry or enforces it at the group level — which tells a dApp nothing about the individual prover. We wrote a custom Circom circuit that proves the specific prover's credential is within the freshness window, without revealing when they were issued."

**Visual:**
1. Show the page — point at the *Live · seeded credential, on-chain verify* mode toggle
2. Point at the scenario card: "issuanceTime (on-chain): 2026-03-18 · 30 days ago", tree root, group 25
3. Click **Generate proof**
4. The new 5-step progress UI kicks in — *Deriving identity commitment → Building Merkle inclusion proof → Encoding Poseidon hashes → Generating Groth16 proof over 4,665 wires → Serializing*
5. Around 4.5 seconds in, it completes with the green "Proof generated in X ms" box showing nullifier + merkleRoot
6. Click **Verify proof**
7. Green banner: *"Proof accepted on-chain. HSKPassportFreshness.previewVerifyFresh() returned true. Proof is valid, nullifier unused, merkleRoot in registry history."*
8. Click the Composer link in the banner → Blockscout opens on the deployed HSKPassportFreshness contract
9. (Optional) drag the freshness-window slider below 30 and click Generate again — the circuit refuses to prove, friendly amber banner shown. Brief pause, then reset.

**Voiceover continues:**
> "A real Groth16 proof. Generated in your browser in under five seconds. Verified against a Solidity verifier deployed on HashKey testnet — the green checkmark you just saw came from the chain, not from us. And when the credential is outside the freshness window, the circuit mathematically refuses to prove it. That's the privacy-preserving expiry check. Per-prover, not per-group. Live today."

---

### 02:00 — 02:20 — User dashboard (20 sec)

**On screen:** Navigate to `/user` → Verified Data tab

**Voiceover:**
> "Users see their verified identity, fetched live from Sumsub — never stored on our side. Toggle to see the full data, masked by default."

**Visual:**
1. Show the Verified Identity card with masked fields
2. Click "Show full details" — fields un-mask
3. Switch to Credentials tab — show the on-chain credential as Issued

**Voiceover continues:**
> "Privacy isn't a marketing claim. We don't have your data. Sumsub does. We have a hash."

---

### 02:20 — 02:45 — The strategic moat (25 sec)

**On screen:** Back to homepage → scroll to the "Five things no other zkID submission has live today" section

**Voiceover:**
> "Five things that together make HSK Passport the compliance layer regulated dApps on HashKey Chain can actually deploy today. Real Sumsub, wired. HashKey's own KYC SBT bridged. A Policy Composer that generates real code. A v6 per-prover ZK expiry proof. A published SDK and a forty-eight-hour timelock for every owner action. The primitives are all here. The inevitability is that every regulated dApp on this chain adopts them."

**Visual:**
- Scroll through the 5-card section slowly, one card at a time
- Land on the Governance link at the bottom of card 05 — briefly show the 48h timelock contract on Blockscout

---

### 02:45 — 03:00 — Closing card (15 sec)

**On screen:** Static end card with:

- HSK Passport logo (top-left)
- "The compliance layer for HashKey Chain — v6 · per-prover ZK freshness"
- URL: `hskpassport.gudman.xyz`
- Demo: `hskpassport.gudman.xyz/demo/fresh`
- GitHub: `github.com/Ridwannurudeen/hsk-passport`
- HashKey Chain Horizon Hackathon — ZKID Track

**Voiceover:**
> "HSK Passport. The compliance layer for HashKey Chain. Live now at hskpassport-dot-gudman-dot-xyz. Built for the Horizon ZKID track."

---

## Recording tips

- **Pace:** Slower than feels natural. Judges are skim-watching at 1.5x — leave breathing room.
- **Cursor:** Move deliberately. No frantic clicking.
- **Pauses:** Half-second pause between sections so editing/title cards can be inserted.
- **Audio:** Re-record any section where you stumbled. Don't try to fix in editing.
- **Background noise:** Mute notifications, close Slack/Discord/Teams.
- **MetaMask popups:** Either crop them out via OBS region capture, OR use the burner wallet so they're disposable to show.
- **v6 proof section is the wow moment** — slow it down, let the 5-step progress play through on screen.

## Post-production (optional)

- **Cuts only**, no transitions/effects
- Title overlay per section: "01 · Composer", "02 · Real Sumsub", "03 · v6 ZK freshness", "04 · Dashboard", "05 · The moat"
- Captions help — auto-generate via YouTube Studio after upload
- Export as MP4 H.264, ~6–10 Mbps, 1080p

## Upload + share

1. Upload to YouTube as **unlisted** initially (so you can re-cut)
2. After approval: switch to public, add description with all links
3. Pin the link in:
   - DoraHacks BUIDL submission (mandatory)
   - GitHub README at the top
   - X/Twitter post tagging `@HSKChain` `@HashKeyHSK` `@HashKeyCapital`
   - HashKey hackathon Telegram group

---

## Description template (paste under the YouTube video)

```
HSK Passport — the compliance layer for regulated apps on HashKey Chain.

Verify once with Sumsub (the same KYC provider HashKey Exchange uses).
Privately prove KYC, accreditation, or jurisdiction to any HashKey dApp
via zero-knowledge proofs. Reveal nothing on-chain.

v6 adds a per-prover ZK credential-freshness proof — a custom Circom
circuit and an on-chain Solidity verifier that lets a dApp enforce
"this credential was issued within the last N days" without revealing
the exact issuance time. Live on testnet.

Live demo:    https://hskpassport.gudman.xyz
Try v6 ZK:    https://hskpassport.gudman.xyz/demo/fresh
Composer:     https://hskpassport.gudman.xyz/composer
GitHub:       https://github.com/Ridwannurudeen/hsk-passport
SDK on npm:   https://www.npmjs.com/package/hsk-passport-sdk

Built for the HashKey Chain Horizon Hackathon 2026 — ZKID Track.

Stack: Semaphore v4 + custom Circom v6 freshness circuit + Groth16 on
bn128 precompiles + Sumsub real KYC + OpenZeppelin Timelock + Next.js 16
+ Fastify + SQLite indexer.

Tech depth: 16 contracts on HashKey testnet (v5 + v6 freshness stack),
74 passing Hardhat tests (including 6 end-to-end ZK tests that generate
real Groth16 proofs and verify them via the deployed Solidity verifier),
3 rounds of internal audit fixes documented at /roadmap.

Thanks to @HSKChain @HashKeyHSK @HashKeyCapital for the hackathon and
the platform.
```
