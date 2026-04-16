# HSK Passport — Demo Video Script

**Target length:** 2:30 — 3:00 minutes
**Resolution:** 1080p, 30fps
**Format:** Screen recording with voiceover (no face cam needed)
**Anchor:** Composer is the flagship — show it twice

---

## Setup checklist (run before recording)

- [ ] Open a fresh **Chrome incognito window**
- [ ] Install MetaMask in the incognito window only (no other extensions)
- [ ] Create a brand-new MetaMask account labeled "demo"
- [ ] Fund with HashKey testnet HSK from https://faucet.hsk.xyz (a few HSK is plenty)
- [ ] Switch MetaMask to **HashKey Chain testnet**
- [ ] In DevTools console: `localStorage.clear()` then close DevTools
- [ ] Open https://hskpassport.gudman.xyz in the tab
- [ ] Have a second tab ready: `ssh root@75.119.153.252 "journalctl -u hsk-passport-api -f"` showing live backend logs
- [ ] Open OBS or screen recorder, set capture region to just the browser window (hide MetaMask popups in corner)
- [ ] Test audio levels — speak naturally, headset mic recommended

---

## Script (with timing + visuals)

### 00:00 — 00:15 — Hook (15 sec)

**On screen:** Homepage hero (https://hskpassport.gudman.xyz/)

**Voiceover:**
> "Every regulated dApp on HashKey Chain — silver-backed RWAs, tokenized funds, accredited DeFi — needs KYC. Today, every team rebuilds it from scratch and leaks identity on-chain. HSK Passport is the default compliance layer that fixes both."

**Visual:** Slow scroll showing the hero, the metric row (55 tests, 0 PII), and the standards strip. Emphasize "real Sumsub wired" badge.

---

### 00:15 — 00:50 — The Composer is the headline (35 sec)

**On screen:** Navigate to `/composer`

**Voiceover:**
> "Here's what makes HSK Passport adoptable. Any dApp builder picks compliance rules — KYC verified, accredited investor, jurisdictions — and we generate the Solidity contract, React component, and Hardhat test."

**Visual:**
1. Click the **"APAC Regional RWA"** preset card → all the checkboxes flip on, dApp name updates
2. Watch the right-hand code panels regenerate live with the new policy
3. Scroll down to show the generated Solidity contract — point at the `gatedAction` function with caller-bound proof + KYC check + jurisdiction set proof
4. Click the "Copy" button on the Solidity block

**Voiceover continues:**
> "Tick a preset. Copy the code. You just integrated KYC + accredited + jurisdiction gating into your dApp in 30 seconds. That's the inevitability — compliance you can copy-paste."

---

### 00:50 — 01:20 — Real Sumsub KYC (30 sec)

**On screen:** Navigate to `/kyc`

**Voiceover:**
> "Now from the user side. We use Sumsub — the same regulated KYC provider HashKey Exchange uses. Most other ZKID submissions simulate KYC. We actually wire it."

**Visual:**
1. Click "Get verified" — wallet signature popup, sign
2. Sumsub widget loads (the SANDBOX MODE badge is visible — be honest)
3. Use Sumsub sandbox test applicant: any fake passport, sandbox auto-approves in seconds
4. Switch to backend logs tab → `[sumsub] webhook applicantReviewed GREEN externalUserId=...`
5. Then `[auto-issuer] issuing credential for commitment ...`
6. Switch to Blockscout tab showing the on-chain `CredentialIssued` event

**Voiceover continues:**
> "Sumsub fires the webhook. HSK Passport verifies the HMAC over the raw bytes — that's a real audit fix, not security theater. The auto-issuer mints the credential on-chain. Zero documents touch our servers."

---

### 01:20 — 01:50 — Anonymous proof + mint (30 sec)

**On screen:** Navigate to `/demo`

**Voiceover:**
> "The credential exists on-chain. Now the user proves they hold it without revealing which member of the group they are."

**Visual:**
1. Click "Generate proof" — show the proof generation status (~15 seconds, in-browser WASM)
2. Show the ProofCard — point at the anonymity-set warning if shown
3. Click "Mint hSILVER" — MetaMask popup, confirm
4. Show the success state with on-chain tx hash
5. Click the explorer link → Blockscout tab opens showing the gated mint succeeded

**Voiceover continues:**
> "Proof bound to the caller — no front-running. Per-action nullifier — no sybil. The dApp just learned 'this user is KYC verified' — nothing else. The mint succeeded, the user got their token, and their identity stays private."

---

### 01:50 — 02:15 — The user dashboard (25 sec)

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

### 02:15 — 02:45 — The strategic anchor (30 sec)

**On screen:** Back to `/composer` — click another preset (e.g. "Accredited DeFi Pool")

**Voiceover:**
> "Back to the Composer. Watch how the policy changes. KYC plus accredited investor. New contract generated. New tests. Same SDK call on the frontend. This is what makes HSK Passport the default — any HashKey dApp can be regulated in 10 minutes."

**Visual:**
- Click preset, watch code regenerate
- Briefly show the Solidity output diff
- Cut to the README showing the competitive table

**Voiceover continues:**
> "We're not replacing HashKey's compliance stack. We're making it reusable, private, and copy-pasteable across the entire ecosystem."

---

### 02:45 — 03:00 — Closing card (15 sec)

**On screen:** Static end card with:
- HSK Passport logo (top-left)
- "Default compliance layer for HashKey Chain"
- URL: `hskpassport.gudman.xyz`
- GitHub: `github.com/Ridwannurudeen/hsk-passport`
- HashKey Chain Horizon Hackathon — ZKID Track

**Voiceover:**
> "HSK Passport. The default compliance layer for HashKey Chain. Live now at hskpassport-dot-gudman-dot-xyz. Built for the Horizon ZKID track."

---

## Recording tips

- **Pace:** Slower than feels natural. Judges are skim-watching at 1.5x — leave breathing room.
- **Cursor:** Move deliberately. No frantic clicking.
- **Pauses:** Half-second pause between sections so editing/title cards can be inserted.
- **Audio:** Re-record any section where you stumbled. Don't try to fix in editing.
- **Background noise:** Mute notifications, close Slack/Discord/Teams.
- **MetaMask popups:** Either crop them out via OBS region capture, OR use the burner wallet so they're disposable to show.

## Post-production (optional)

- **Cuts only**, no transitions/effects
- Add a title overlay for each section: "01 · Composer", "02 · Real Sumsub", "03 · Anonymous mint"
- Captions help — auto-generate via YouTube studio after upload
- Export as MP4 H.264, ~6-10 Mbps, 1080p

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
HSK Passport — the default compliance layer for regulated apps on HashKey Chain.

Verify once with Sumsub (the same KYC provider HashKey Exchange uses). Privately prove KYC, accreditation, or jurisdiction to any HashKey dApp via zero-knowledge proofs. Reveal nothing on-chain.

Live demo: https://hskpassport.gudman.xyz
Policy Composer: https://hskpassport.gudman.xyz/composer
GitHub: https://github.com/Ridwannurudeen/hsk-passport
SDK on npm: https://www.npmjs.com/package/hsk-passport-sdk

Built for the HashKey Chain Horizon Hackathon 2026 — ZKID Track.

Stack: Semaphore v4 ZK · Sumsub real KYC · OpenZeppelin Timelock governance · Next.js + Tailwind frontend · Fastify + SQLite indexer.

Tech depth: 17 contracts, 55 passing tests, 3 rounds of audit fixes documented at /roadmap.

Thanks to @HSKChain @HashKeyHSK @HashKeyCapital for the hackathon and the platform.
```
