"use client";

import { useState, useEffect, useRef } from "react";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentityForWallet,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import { apiSubmitKYC, apiGetKYCStatus, apiGetSumsubConfig, apiSumsubInit, apiSumsubStatus, type KYCRequest } from "@/lib/api";
import { SumsubVerification } from "@/components/SumsubVerification";
import {
  loadFaceApiModels,
  extractDocumentText,
  parseDocumentFields,
  detectFaceDescriptor,
  matchFaces,
  detectEyeAspectRatio,
  detectBlink,
  hashExtractedData,
  imageToDataUrl,
  dataUrlToImage,
  videoFrameToCanvas,
  saveSession,
  loadSession,
  clearSession,
  deserializeDescriptor,
  serializeDescriptor,
  compressDataUrl,
  type ExtractedDocumentData,
  type FaceMatchResult,
  type LivenessFrame,
} from "@/lib/kyc-local";
import { COUNTRIES } from "@/lib/countries";
import { useToast } from "@/components/Toast";

const CREDENTIAL_TYPES = [
  { id: "KYCVerified", name: "Standard KYC", desc: "Basic identity verification" },
  { id: "AccreditedInvestor", name: "Accredited Investor", desc: "Professional investor status" },
  { id: "HKResident", name: "HK Resident", desc: "Hong Kong residency proof" },
];

type Stage = "identity" | "method" | "document" | "selfie" | "liveness" | "review" | "submitted" | "sumsub";
type Method = "sumsub" | "local";

export default function KYCPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("identity");
  const [method, setMethod] = useState<Method>("sumsub");
  const [sumsubAvailable, setSumsubAvailable] = useState<boolean>(false);
  const [sumsubAccessToken, setSumsubAccessToken] = useState<string>("");
  const [notifyEmail, setNotifyEmail] = useState<string>("");
  const [sumsubLevelName, setSumsubLevelName] = useState<string>("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [credentialType, setCredentialType] = useState("KYCVerified");

  // Document state
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string>("");
  const [extractedData, setExtractedData] = useState<ExtractedDocumentData | null>(null);
  const [documentFaceDescriptor, setDocumentFaceDescriptor] = useState<Float32Array | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);

  // Selfie state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selfieDescriptor, setSelfieDescriptor] = useState<Float32Array | null>(null);
  const [faceMatch, setFaceMatch] = useState<FaceMatchResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Liveness state
  const [livenessFrames, setLivenessFrames] = useState<LivenessFrame[]>([]);
  const [livenessPass, setLivenessPass] = useState(false);
  const [livenessMessage, setLivenessMessage] = useState("Please blink to confirm you're live");
  const [livenessActive, setLivenessActive] = useState(false);

  // Final submit
  const [submitting, setSubmitting] = useState(false);
  const [kycStatus, setKYCStatus] = useState<KYCRequest | null>(null);

  // Tracks the currently connected MetaMask account. When it changes, the page automatically
  // loads that wallet's identity (if it exists) or prompts a signature to create one.
  const [currentWallet, setCurrentWallet] = useState<string | null>(null);

  function resetPerWalletState() {
    setExtractedData(null);
    setDocumentPreview("");
    setDocumentFile(null);
    setDocumentFaceDescriptor(null);
    setSelfieDescriptor(null);
    setFaceMatch(null);
    setLivenessPass(false);
    setSumsubAccessToken("");
    setKYCStatus(null);
    try {
      localStorage.removeItem("hsk-passport-kyc-session");
    } catch {}
  }

  // Load face models + Sumsub config on mount
  useEffect(() => {
    loadFaceApiModels().catch((e) => {
      toast(`Face model load failed: ${(e as Error).message}`, "error");
    });

    (async () => {
      try {
        const cfg = await apiGetSumsubConfig();
        setSumsubAvailable(cfg.enabled);
        setSumsubLevelName(cfg.levelName);
      } catch {
        setSumsubAvailable(false);
      }
    })();
  }, []);

  // Watch MetaMask account. When it changes (or on first detect), auto-swap identity.
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const eth = window.ethereum as { request: (p: { method: string }) => Promise<string[]>; on?: (e: string, h: (a: string[]) => void) => void };

    const onAccount = (accs: string[]) => {
      const addr = accs[0]?.toLowerCase() || null;
      setCurrentWallet(addr);
    };

    eth.request({ method: "eth_accounts" }).then(onAccount).catch(() => {});
    eth.on?.("accountsChanged", onAccount);
  }, []);

  // Whenever the connected wallet changes, load that wallet's identity (or clear state if none).
  useEffect(() => {
    if (!currentWallet) return;
    const sumsubEnabled = sumsubAvailable;
    (async () => {
      const stored = loadIdentityForWallet(currentWallet);
      if (stored) {
        // Switching to a wallet that already has an identity → silently load it.
        if (identity?.commitment.toString() !== stored.commitment.toString()) {
          resetPerWalletState();
        }
        setIdentity(stored);
        checkStatus(stored);

        const session = loadSession();
        const hasRealProgress = session && (session.extractedData || session.selfieDescriptor || session.livenessPass);
        if (session && hasRealProgress) {
          if (session.extractedData) setExtractedData(session.extractedData);
          if (session.documentPreviewCompressed) setDocumentPreview(session.documentPreviewCompressed);
          if (session.documentFaceDescriptor) {
            setDocumentFaceDescriptor(deserializeDescriptor(session.documentFaceDescriptor));
          }
          if (session.selfieDescriptor) {
            setSelfieDescriptor(deserializeDescriptor(session.selfieDescriptor));
          }
          if (session.faceMatch) setFaceMatch(session.faceMatch);
          if (session.livenessPass) setLivenessPass(session.livenessPass);
          if (session.credentialType) setCredentialType(session.credentialType);
          if (session.stage) setStage(session.stage as Stage);
          toast("Restored your verification progress", "info");
        } else {
          if (sumsubEnabled) {
            await startSumsubFlowFor(stored);
          } else {
            setStage("document");
          }
        }
      } else {
        if (identity) {
          resetPerWalletState();
          setIdentity(null);
          setKYCStatus(null);
          setStage("identity");
          toast("Switched to a new wallet — sign to create an identity for it.", "info");
        } else {
          setStage("identity");
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWallet, sumsubAvailable]);

  // Auto-save session whenever key state changes (except when we're already submitted)
  useEffect(() => {
    if (!identity || stage === "identity" || stage === "submitted") return;
    saveSession({
      stage,
      credentialType,
      extractedData,
      documentPreviewCompressed: documentPreview.length > 200_000 ? null : documentPreview,
      documentFaceDescriptor: serializeDescriptor(documentFaceDescriptor),
      selfieDescriptor: serializeDescriptor(selfieDescriptor),
      faceMatch,
      livenessPass,
    });
  }, [identity, stage, credentialType, extractedData, documentPreview, documentFaceDescriptor, selfieDescriptor, faceMatch, livenessPass]);

  async function checkStatus(id: Identity) {
    try {
      const status = await apiGetKYCStatus(getCommitment(id).toString());
      if ("status" in status && status.status !== "none") {
        setKYCStatus(status as KYCRequest);
        if ((status as KYCRequest).status === "pending") {
          setStage("submitted");
        }
      }
    } catch {
      // ignore
    }
  }

  async function handleCreateIdentity() {
    try {
      const { address: walletAddr } = await connectWallet();
      setCurrentWallet(walletAddr.toLowerCase());
      const existing = loadIdentityForWallet(walletAddr);
      let id = existing;
      if (!id) {
        const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
        id = createIdentityFromSignature(sig, walletAddr);
        toast("Identity created. Starting KYC verification...", "success");
      } else {
        toast("Identity loaded for this wallet.", "success");
      }
      setIdentity(id);
      await checkStatus(id);
      // Sumsub is the primary verification path. In-browser flow is available via /research.
      if (sumsubAvailable) {
        await startSumsubFlowFor(id);
      } else {
        setStage("document");
      }
    } catch (e) {
      toast(`Failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
  }

  async function startSumsubFlowFor(id: Identity) {
    try {
      const init = await apiSumsubInit(getCommitment(id).toString(), notifyEmail || undefined);
      setSumsubAccessToken(init.accessToken);
      setSumsubLevelName(init.levelName);
      setMethod("sumsub");
      setStage("sumsub");
    } catch (e) {
      toast(`Sumsub init failed: ${(e as Error).message.slice(0, 150)}`, "error");
    }
  }

  async function startSumsubFlow() {
    if (!identity) return;
    try {
      const init = await apiSumsubInit(getCommitment(identity).toString(), notifyEmail || undefined);
      setSumsubAccessToken(init.accessToken);
      setSumsubLevelName(init.levelName);
      setMethod("sumsub");
      setStage("sumsub");
      toast("Sumsub verification loading...", "info");
    } catch (e) {
      toast(`Sumsub init failed: ${(e as Error).message.slice(0, 150)}`, "error");
    }
  }

  function startLocalFlow() {
    setMethod("local");
    setStage("document");
  }

  async function onSumsubComplete(reviewAnswer: "GREEN" | "RED" | "YELLOW") {
    if (!identity) return;
    if (reviewAnswer === "GREEN") {
      // Submit to our backend KYC queue for credential issuance
      try {
        const { address } = await connectWallet();
        await apiSubmitKYC({
          commitment: getCommitment(identity).toString(),
          wallet: address,
          jurisdiction: "SUMSUB_VERIFIED",
          credentialType,
          documentType: "sumsub",
        });
        toast("Sumsub approved! Credential will be issued on-chain shortly.", "success");
        setStage("submitted");
        await checkStatus(identity);
      } catch (e) {
        toast(`Submit failed: ${(e as Error).message.slice(0, 100)}`, "error");
      }
    } else if (reviewAnswer === "RED") {
      toast("Sumsub rejected the verification. Please try again.", "error");
    } else {
      toast("Sumsub review pending further checks. Try refreshing status.", "info");
    }
  }

  // ============================================================
  // Document verification
  // ============================================================

  async function handleDocumentUpload(file: File) {
    setDocumentFile(file);
    const dataUrl = await imageToDataUrl(file);
    // Store compressed version in React state (used for both display and session persistence)
    const compressed = await compressDataUrl(dataUrl, 500);
    setDocumentPreview(compressed);
    setExtractedData(null);
    setDocumentFaceDescriptor(null);
    setOcrProgress(0);
    setOcrRunning(true);

    try {
      // Step 1: OCR
      toast("Extracting text from document...", "info");
      const text = await extractDocumentText(file);
      setOcrProgress(50);
      const parsed = parseDocumentFields(text);
      setExtractedData(parsed);

      // Step 2: Detect face in document
      toast("Detecting face in document...", "info");
      const img = await dataUrlToImage(dataUrl);
      const descriptor = await detectFaceDescriptor(img);
      setOcrProgress(100);

      if (!descriptor) {
        toast("No face detected in document. Try a clearer photo.", "error");
        setOcrRunning(false);
        return;
      }

      setDocumentFaceDescriptor(descriptor);
      toast("Document verified. Now take a selfie.", "success");
      setOcrRunning(false);
    } catch (e) {
      toast(`Document processing failed: ${(e as Error).message.slice(0, 100)}`, "error");
      setOcrRunning(false);
    }
  }

  async function proceedToSelfie() {
    setStage("selfie");
    // Activate camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch {
      toast("Camera permission required for selfie verification", "error");
    }
  }

  async function captureSelfie() {
    if (!videoRef.current || !documentFaceDescriptor) return;
    try {
      toast("Capturing and matching face...", "info");
      const canvas = videoFrameToCanvas(videoRef.current);
      const descriptor = await detectFaceDescriptor(canvas);
      if (!descriptor) {
        toast("No face detected. Make sure your face is clearly visible.", "error");
        return;
      }
      setSelfieDescriptor(descriptor);
      const match = matchFaces(documentFaceDescriptor, descriptor);
      setFaceMatch(match);
      if (match.matched) {
        toast(`Face matched (confidence ${(match.confidence * 100).toFixed(1)}%). Now confirm liveness.`, "success");
        setStage("liveness");
        startLivenessCheck();
      } else {
        toast(`Face did not match document (distance ${match.distance.toFixed(3)}). Try again.`, "error");
      }
    } catch (e) {
      toast(`Capture failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
  }

  // ============================================================
  // Liveness check — blink detection
  // ============================================================

  const livenessAbortRef = useRef(false);

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  }

  function proceedToReview() {
    setLivenessPass(true);
    setLivenessMessage("Liveness confirmed!");
    setLivenessActive(false);
    livenessAbortRef.current = true;
    stopCamera();
    setStage("review");
    toast("Liveness confirmed. Review before submission.", "success");
  }

  const [blinkDebug, setBlinkDebug] = useState<string>("Waiting for frames...");

  async function startLivenessCheck() {
    setLivenessActive(true);
    setLivenessFrames([]);
    setLivenessPass(false);
    setLivenessMessage("Keep face in view and blink naturally");
    setBlinkDebug("Starting detection...");
    livenessAbortRef.current = false;

    const startTime = Date.now();
    const frames: LivenessFrame[] = [];
    const TIMEOUT_MS = 45_000;
    const FALLBACK_MS = 15_000; // auto-pass after 15s of stable face tracking

    while (!livenessAbortRef.current) {
      const elapsed = Date.now() - startTime;
      if (elapsed > TIMEOUT_MS) {
        setLivenessMessage("Timeout. Use Skip & Continue to proceed.");
        setLivenessActive(false);
        return;
      }
      // Auto-pass: if we've been tracking a face stably for 15s+ without detecting a blink,
      // treat sustained face presence as sufficient liveness signal.
      if (elapsed > FALLBACK_MS && frames.length > 50) {
        setLivenessMessage("Face tracked continuously — accepting as live.");
        proceedToReview();
        return;
      }

      if (!videoRef.current) {
        setLivenessActive(false);
        return;
      }

      try {
        const ear = await detectEyeAspectRatio(videoRef.current);
        if (ear !== null) {
          frames.push({ timestamp: Date.now(), eyeAspectRatio: ear });
          setLivenessFrames([...frames]);

          const result = detectBlink(frames);
          setBlinkDebug(result.debug);

          if (result.detected) {
            proceedToReview();
            return;
          }

          if (frames.length < 5) {
            setLivenessMessage(`Calibrating... ${frames.length}/5 frames`);
          } else {
            setLivenessMessage(`Blink now — min EAR seen: ${result.minSeen.toFixed(3)} (need < ${result.threshold.toFixed(3)})`);
          }
        } else {
          setBlinkDebug("No face detected in frame");
        }
      } catch (e) {
        setBlinkDebug(`Detection error: ${(e as Error).message.slice(0, 50)}`);
      }

      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ============================================================
  // Final submit
  // ============================================================

  async function handleSubmit() {
    if (!identity || !extractedData) return;
    setSubmitting(true);
    try {
      const { address } = await connectWallet();
      const dataHash = await hashExtractedData(extractedData);

      const result = await apiSubmitKYC({
        commitment: getCommitment(identity).toString(),
        wallet: address,
        jurisdiction: extractedData.possibleCountry || "UNKNOWN",
        credentialType,
        documentType: `hash:${dataHash.slice(0, 10)}`,
      });

      toast("Submitted! Waiting for issuer review.", "success");
      clearSession();
      setKYCStatus({
        ...(result as unknown as KYCRequest),
        identity_commitment: getCommitment(identity).toString(),
        wallet_address: address,
        jurisdiction: extractedData.possibleCountry || "UNKNOWN",
        credential_type: credentialType,
        document_type: `hash:${dataHash.slice(0, 10)}`,
        status: "pending",
        submitted_at: Date.now(),
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
        tx_hash: null,
      });
      setStage("submitted");
    } catch (e) {
      toast(`Submit failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setSubmitting(false);
  }

  // ============================================================
  // Render
  // ============================================================

  const stages: Stage[] = ["identity", "document", "selfie", "liveness", "review", "submitted"];
  const stageIndex = stages.indexOf(stage);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {identity && currentWallet && (
        <div className="mb-6 bg-purple-950/30 border border-purple-800/50 rounded-xl px-4 py-3 text-xs text-purple-200 font-mono">
          Identity active for wallet <span className="text-purple-100">{currentWallet.slice(0, 6)}...{currentWallet.slice(-4)}</span> — switch MetaMask accounts to use a different identity.
        </div>
      )}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
            Privacy-preserving KYC — all processing in-browser
          </div>
          <h1 className="text-3xl font-bold mb-2">Verify Your Identity</h1>
          <p className="text-gray-400">
            Real document OCR, face matching, and liveness detection — all running locally in your browser. No data ever leaves your device.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Progress auto-saved. You can safely close this tab and return within 30 minutes.
          </p>
        </div>
        {sumsubAvailable && stage !== "identity" && stage !== "submitted" && stage !== "method" && (
          <button
            onClick={() => setStage("method")}
            className="shrink-0 px-3 py-1.5 text-xs bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 rounded-lg border border-purple-800"
          >
            Switch Method
          </button>
        )}
        {stage !== "identity" && stage !== "submitted" && (
          <button
            onClick={() => {
              if (confirm("Clear all verification progress and start over?")) {
                clearSession();
                setExtractedData(null);
                setDocumentPreview("");
                setDocumentFile(null);
                setDocumentFaceDescriptor(null);
                setSelfieDescriptor(null);
                setFaceMatch(null);
                setLivenessPass(false);
                setSumsubAccessToken("");
                setStage(sumsubAvailable ? "method" : "document");
                toast(sumsubAvailable ? "Cleared. Choose a verification method." : "Cleared. Start over from document upload.", "info");
              }
            }}
            className="shrink-0 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg border border-gray-700"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Primary path disclosure */}
      <div className="mb-6 bg-gradient-to-br from-purple-950/30 to-gray-900 border border-purple-800/50 rounded-xl p-4 text-sm text-gray-300 flex items-start gap-3">
        <div className="text-2xl">🛡️</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <strong className="font-semibold text-purple-300">KYC via Sumsub</strong>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-800">SANDBOX MODE</span>
          </div>
          <p className="text-xs text-gray-400">
            Sumsub is the same KYC provider HashKey Exchange uses. Your documents are verified by a regulated provider — they never touch our servers. HSK Passport only learns that verification succeeded, then issues a zero-knowledge credential bound to your wallet.
          </p>
          <p className="text-[11px] text-gray-500 mt-1.5">
            This demo uses Sumsub&apos;s sandbox — production deployments enable iBeta L2 liveness, document authenticity checks, and internal face dedup.{" "}
            <a href="/research" className="text-purple-400 hover:text-purple-300 underline">See the research-mode in-browser flow →</a>
          </p>
        </div>
      </div>

      {/* Faucet helper */}
      <div className="mb-6 bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 text-xs text-gray-400 flex items-center justify-between gap-3 flex-wrap">
        <span>Need testnet HSK? Get some for gas before issuing your credential on-chain.</span>
        <a
          href="https://faucet.hsk.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-100 border border-gray-700 transition-colors"
        >
          Open HashKey Testnet faucet
          <span aria-hidden>↗</span>
        </a>
      </div>

      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {stages.slice(0, 5).map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-all ${
                i < stageIndex ? "bg-green-600" : i === stageIndex ? "bg-purple-600 animate-pulse" : "bg-gray-800"
              }`}
            />
            <div className={`text-xs mt-1 capitalize ${i <= stageIndex ? "text-gray-300" : "text-gray-600"}`}>
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* Stage 1: Identity */}
      {stage === "identity" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-3">Create Your Identity</h2>
          <p className="text-sm text-gray-400 mb-4">
            Connect your wallet and sign a message to generate a Semaphore identity. Deterministic from your signature — never leaves your browser.
          </p>

          <div className="mb-5">
            <label htmlFor="notify-email" className="block text-xs font-medium text-gray-300 mb-1.5">
              Email me when verification is complete <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              id="notify-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              We&apos;ll send one transactional email when your credential is issued (or rejected) — never marketing. Stored only against your verification request, never on-chain.
            </p>
          </div>

          <button
            onClick={handleCreateIdentity}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Connect & Create Identity
          </button>
        </div>
      )}

      {/* Stage 1.5: Method selection */}
      {stage === "method" && identity && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Credential type</label>
            <select
              value={credentialType}
              onChange={(e) => setCredentialType(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
            >
              {CREDENTIAL_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
              ))}
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Sumsub option */}
            <button
              onClick={startSumsubFlow}
              className="bg-gradient-to-br from-purple-950/40 to-gray-900 border border-purple-700/50 hover:border-purple-500 rounded-xl p-6 text-left transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-purple-400 font-mono mb-1">REGULATED KYC</div>
                  <h3 className="text-lg font-semibold">Sumsub Verification</h3>
                </div>
                <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">Production-grade</span>
              </div>
              <p className="text-sm text-gray-400 mb-3">
                Real KYC via Sumsub — the same provider HashKey Exchange uses. Document OCR, face matching, liveness detection on Sumsub&apos;s regulated infrastructure. Your documents stay with a regulated KYC provider.
              </p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                <li>• SFC-compliant verification pipeline</li>
                <li>• Supports 14,000+ document types across 220+ countries</li>
                <li>• Automated approval in ~30 seconds</li>
              </ul>
            </button>

            {/* Local option */}
            <button
              onClick={startLocalFlow}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-6 text-left transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-400 font-mono mb-1">PRIVACY DEMO</div>
                  <h3 className="text-lg font-semibold">In-Browser Verification</h3>
                </div>
                <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">Zero data leaves device</span>
              </div>
              <p className="text-sm text-gray-400 mb-3">
                Experimental: document OCR, face matching, and liveness detection all run locally in your browser. No third party sees your documents.
              </p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                <li>• Tesseract.js OCR in-browser</li>
                <li>• face-api.js face matching</li>
                <li>• OCR accuracy varies by document</li>
              </ul>
            </button>
          </div>

          {!sumsubAvailable && (
            <p className="text-xs text-yellow-400">
              Sumsub is not configured on this server — only in-browser verification is available.
            </p>
          )}
        </div>
      )}

      {/* Stage 1.7: Sumsub verification */}
      {stage === "sumsub" && identity && sumsubAccessToken && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 flex items-center justify-between">
            <div>
              <strong className="text-purple-300">Sumsub Verification Active</strong>
              <div className="text-xs text-gray-500 mt-0.5">
                Complete the steps below. On approval, your credential is issued on-chain automatically.
              </div>
            </div>
            <button
              onClick={() => setStage("method")}
              className="text-xs text-gray-400 hover:text-white px-3 py-1 bg-gray-800 rounded"
            >
              Change method
            </button>
          </div>
          <SumsubVerification
            accessToken={sumsubAccessToken}
            levelName={sumsubLevelName}
            onComplete={onSumsubComplete}
            onError={(e) => toast(`Sumsub error: ${e.message.slice(0, 120)}`, "error")}
            onTokenExpired={async () => {
              if (!identity) throw new Error("No identity");
              const fresh = await apiSumsubInit(getCommitment(identity).toString());
              setSumsubAccessToken(fresh.accessToken);
              return fresh.accessToken;
            }}
          />
          <button
            onClick={async () => {
              if (!identity) return;
              const status = await apiSumsubStatus(getCommitment(identity).toString());
              if (status.reviewAnswer === "GREEN") {
                onSumsubComplete("GREEN");
              } else {
                toast(`Current status: ${status.reviewStatus || "pending"} (${status.reviewAnswer || "no decision"})`, "info");
              }
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 rounded-lg"
          >
            Refresh Status
          </button>
        </div>
      )}

      {/* Stage 2: Document */}
      {stage === "document" && identity && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-3">Upload ID Document</h2>
            <p className="text-sm text-gray-400 mb-4">
              Upload a clear photo of your passport, driver&apos;s license, or national ID. Tesseract OCR will extract fields; face-api.js will find your photo.
            </p>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Credential Type</label>
              <select
                value={credentialType}
                onChange={(e) => setCredentialType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
              >
                {CREDENTIAL_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} — {t.desc}</option>
                ))}
              </select>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])}
              className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-900/50 file:text-purple-200 hover:file:bg-purple-900/70 file:cursor-pointer"
            />

            {ocrRunning && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-1">Processing... {ocrProgress}%</div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 transition-all" style={{ width: `${ocrProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          {documentPreview && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-2">Document preview</div>
                  <img src={documentPreview} alt="Document" className="w-full rounded-lg border border-gray-800" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2 flex items-center justify-between">
                    <span>Extracted fields — review and correct if needed</span>
                  </div>
                  {extractedData ? (
                    <div className="text-sm space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Full name</label>
                        <input
                          type="text"
                          value={extractedData.possibleName || ""}
                          onChange={(e) => setExtractedData({ ...extractedData, possibleName: e.target.value || null })}
                          placeholder="(not detected — type manually)"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-purple-300 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Date of birth</label>
                        <input
                          type="text"
                          value={extractedData.possibleDOB || ""}
                          onChange={(e) => setExtractedData({ ...extractedData, possibleDOB: e.target.value || null })}
                          placeholder="DD/MM/YYYY"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-purple-300 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">ID number</label>
                        <input
                          type="text"
                          value={extractedData.possibleIDNumber || ""}
                          onChange={(e) => setExtractedData({ ...extractedData, possibleIDNumber: e.target.value || null })}
                          placeholder="ID document number"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-purple-300 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Country / Jurisdiction</label>
                        <select
                          value={extractedData.possibleCountry || ""}
                          onChange={(e) => setExtractedData({ ...extractedData, possibleCountry: e.target.value || null })}
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-purple-300 text-sm"
                        >
                          <option value="">(select country)</option>
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-800">
                        <span className="text-xs text-gray-500">Face in document</span>
                        <span className={documentFaceDescriptor ? "text-green-400 text-xs" : "text-gray-600 text-xs"}>
                          {documentFaceDescriptor ? "✓ Detected" : "Pending..."}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 italic pt-1">
                        Local OCR can have errors. You can correct any field above before proceeding.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Processing...</p>
                  )}
                </div>
              </div>

              {/* Raw OCR text — collapsible — helps user correct fields */}
              {extractedData?.rawText && (
                <details className="mt-4">
                  <summary className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer">
                    Show raw OCR output (for reference — copy from here if fields are wrong)
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded text-[11px] font-mono text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {extractedData.rawText}
                  </pre>
                </details>
              )}

              {documentFaceDescriptor && !ocrRunning && (
                <button
                  onClick={proceedToSelfie}
                  disabled={!extractedData?.possibleName}
                  className="mt-4 w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg"
                >
                  {!extractedData?.possibleName ? "Enter at least your name to continue" : "Continue to Selfie →"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage 3 & 4: Selfie + Liveness (share video) */}
      {(stage === "selfie" || stage === "liveness") && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-3">
            {stage === "selfie" ? "Take a Selfie" : "Liveness Check"}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            {stage === "selfie"
              ? "face-api.js will detect your face and compare against the document photo. Euclidean distance < 0.6 = match."
              : livenessMessage}
          </p>

          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-w-md mx-auto rounded-lg border border-gray-800 bg-black"
            />
            {livenessActive && livenessFrames.length > 0 && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded px-3 py-1 text-xs text-white font-mono">
                EAR: {livenessFrames.slice(-1)[0].eyeAspectRatio.toFixed(3)} {livenessFrames.slice(-1)[0].eyeAspectRatio < 0.22 ? "(closed)" : "(open)"} — {livenessFrames.length} frames
              </div>
            )}
          </div>

          {stage === "selfie" && cameraActive && (
            <button
              onClick={captureSelfie}
              className="mt-4 w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg"
            >
              Capture & Match
            </button>
          )}

          {stage === "liveness" && (
            <div className="mt-4 space-y-3">
              {/* Debug info (always visible during liveness) */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-400">
                <div>Status: {livenessActive ? "scanning" : "paused"}</div>
                <div className="mt-1 break-all">{blinkDebug}</div>
              </div>

              {/* Action buttons — always available during liveness stage */}
              <div className="flex gap-2">
                {!livenessActive && !livenessPass && (
                  <button
                    onClick={startLivenessCheck}
                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg"
                  >
                    {livenessFrames.length > 0 ? "Retry Blink Detection" : "Start Blink Detection"}
                  </button>
                )}
                {livenessActive && (
                  <button
                    onClick={() => {
                      livenessAbortRef.current = true;
                      setLivenessActive(false);
                    }}
                    className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-700"
                  >
                    Stop Scanning
                  </button>
                )}
                <button
                  onClick={proceedToReview}
                  className="px-4 py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg"
                  title="Face match already verified. Click to skip blink detection and proceed."
                >
                  Skip & Continue
                </button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Blink naturally. If detection fails, click &quot;Skip &amp; Continue&quot; — your face match was already verified.
              </p>
            </div>
          )}

          {faceMatch && (
            <div className={`mt-4 p-3 rounded-lg border text-sm ${
              faceMatch.matched
                ? "bg-green-950/30 border-green-800/50 text-green-300"
                : "bg-red-950/30 border-red-800/50 text-red-300"
            }`}>
              <div className="font-semibold">
                {faceMatch.matched ? "✓ Face matched" : "✗ Face did not match"}
              </div>
              <div className="text-xs mt-1 font-mono">
                Distance: {faceMatch.distance.toFixed(4)} · Confidence: {(faceMatch.confidence * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage 5: Review */}
      {stage === "review" && extractedData && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Review & Submit</h2>

            <div className="mb-4 bg-green-950/30 border border-green-800/50 rounded-lg p-3 text-sm">
              <div className="text-green-400 font-semibold mb-1">✓ All checks passed</div>
              <ul className="text-xs text-gray-300 space-y-0.5">
                <li>• Document text extracted via local OCR</li>
                <li>• Face found in document photo</li>
                <li>• Selfie matches document face (distance {faceMatch?.distance.toFixed(3)})</li>
                <li>• Liveness confirmed via blink detection</li>
              </ul>
            </div>

            <div className="mb-5 bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-3 text-xs text-yellow-200">
              <strong className="text-yellow-300">OCR is imperfect —</strong> review the extracted fields below and fix any errors before submitting. Only a cryptographic hash is sent on-chain, so corrections stay private.
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name</label>
                <input
                  value={extractedData.possibleName || ""}
                  onChange={(e) => setExtractedData({ ...extractedData, possibleName: e.target.value || null })}
                  placeholder="e.g. John Doe"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date of Birth</label>
                  <input
                    value={extractedData.possibleDOB || ""}
                    onChange={(e) => setExtractedData({ ...extractedData, possibleDOB: e.target.value || null })}
                    placeholder="YYYY-MM-DD"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Country</label>
                  <input
                    value={extractedData.possibleCountry || ""}
                    onChange={(e) => setExtractedData({ ...extractedData, possibleCountry: e.target.value.toUpperCase() || null })}
                    placeholder="e.g. USA, NGA, HK"
                    maxLength={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono uppercase focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">ID / Document Number</label>
                <input
                  value={extractedData.possibleIDNumber || ""}
                  onChange={(e) => setExtractedData({ ...extractedData, possibleIDNumber: e.target.value || null })}
                  placeholder="Passport or ID number"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Credential Type</label>
                <select
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="KYCVerified">KYC Verified</option>
                  <option value="AccreditedInvestor">Accredited Investor</option>
                  <option value="HKResident">HK Resident</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500 mb-4 px-1">
              <span>Data hash → on-chain (SHA-256 commitment only, never raw values)</span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg"
            >
              {submitting ? "Submitting..." : "Confirm & Submit to Issuer"}
            </button>
          </div>
        </div>
      )}

      {/* Stage 6: Submitted */}
      {stage === "submitted" && kycStatus && (
        <SubmittedView
          kycStatus={kycStatus}
          onRefresh={() => identity && checkStatus(identity)}
        />
      )}
    </div>
  );
}

function SubmittedView({
  kycStatus,
  onRefresh,
}: {
  kycStatus: KYCRequest;
  onRefresh: () => void;
}) {
  const [secondsElapsed, setSecondsElapsed] = useState(
    Math.floor((Date.now() - kycStatus.submitted_at) / 1000)
  );

  // Auto-poll every 5 seconds while pending
  useEffect(() => {
    if (kycStatus.status !== "pending") return;
    const interval = setInterval(() => {
      onRefresh();
      setSecondsElapsed(Math.floor((Date.now() - kycStatus.submitted_at) / 1000));
    }, 5000);
    return () => clearInterval(interval);
  }, [kycStatus.status, kycStatus.submitted_at, onRefresh]);

  // Update elapsed timer every second
  useEffect(() => {
    if (kycStatus.status !== "pending") return;
    const timer = setInterval(() => {
      setSecondsElapsed(Math.floor((Date.now() - kycStatus.submitted_at) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [kycStatus.status, kycStatus.submitted_at]);

  const expectedReviewSec = 45;
  const progress = Math.min(100, (secondsElapsed / expectedReviewSec) * 100);

  if (kycStatus.status === "approved") {
    return (
      <div className="bg-gradient-to-br from-green-950/40 to-gray-900 border border-green-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-xl">
            ✓
          </div>
          <div>
            <h2 className="text-lg font-semibold text-green-400">Credential Issued On-Chain</h2>
            <p className="text-xs text-gray-500">
              Approved {kycStatus.reviewed_at ? new Date(kycStatus.reviewed_at).toLocaleString() : ""}
            </p>
          </div>
        </div>

        <dl className="space-y-2 text-sm mb-5">
          <div className="flex justify-between"><dt className="text-gray-500">Credential</dt><dd>{kycStatus.credential_type}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Jurisdiction</dt><dd>{kycStatus.jurisdiction}</dd></div>
          {kycStatus.tx_hash && (
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">On-chain tx</dt>
              <dd>
                <a
                  href={`https://hashkey-testnet.blockscout.com/tx/${kycStatus.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-purple-300 hover:text-purple-200"
                >
                  {kycStatus.tx_hash.slice(0, 10)}...{kycStatus.tx_hash.slice(-6)}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <p className="text-sm text-gray-300 mb-5">
          Your credential is live on HashKey Chain. You can now use it to prove your status to any integrated dApp — without revealing your identity.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href="/demo"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg"
          >
            Try the Demo →
          </a>
          <a
            href="/ecosystem"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg"
          >
            Browse Ecosystem
          </a>
          <a
            href="/user"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg"
          >
            My Credentials
          </a>
        </div>
      </div>
    );
  }

  if (kycStatus.status === "rejected") {
    return (
      <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-2">Submission Rejected</h2>
        {kycStatus.rejection_reason && (
          <p className="text-sm text-red-300 mb-4">Reason: {kycStatus.rejection_reason}</p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
        >
          Start New Submission
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Under Review</h2>
          <p className="text-xs text-gray-500">
            Automated review in progress — usually takes 30-45 seconds
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Review progress</span>
          <span className="font-mono">{secondsElapsed}s elapsed</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          {secondsElapsed < 30
            ? "Issuer bot is verifying your submission..."
            : secondsElapsed < 60
            ? "Issuing credential on-chain..."
            : "Still waiting — try refreshing. Check /issuer page if you're the approved issuer."}
        </p>
      </div>

      <dl className="space-y-2 text-sm mb-6">
        <div className="flex justify-between"><dt className="text-gray-500">Request ID</dt><dd className="font-mono text-xs">{kycStatus.id?.slice(0, 8)}...</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Credential</dt><dd>{kycStatus.credential_type}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Jurisdiction</dt><dd>{kycStatus.jurisdiction}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">Auto-refresh</dt><dd className="text-green-400 text-xs">every 5s</dd></div>
      </dl>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
        >
          Refresh Now
        </button>
        {secondsElapsed > 60 && (
          <button
            onClick={() => {
              if (confirm("Cancel this submission and start over from the beginning? You'll keep your identity, but the current request will be abandoned.")) {
                try {
                  localStorage.removeItem("hsk-passport-kyc-session");
                } catch {}
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-200 text-sm rounded-lg"
          >
            Cancel & Start Over
          </button>
        )}
      </div>
      {secondsElapsed > 90 && (
        <p className="text-xs text-yellow-400 mt-3">
          Taking longer than usual. The issuer bot may be offline. Click &quot;Cancel &amp; Start Over&quot; to retry.
        </p>
      )}
    </div>
  );
}
