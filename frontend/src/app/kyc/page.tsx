"use client";

import { useState, useEffect, useRef } from "react";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import { apiSubmitKYC, apiGetKYCStatus, type KYCRequest } from "@/lib/api";
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

type Stage = "identity" | "document" | "selfie" | "liveness" | "review" | "submitted";

export default function KYCPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("identity");
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

  // Load face models + any saved session on mount
  useEffect(() => {
    loadFaceApiModels().catch((e) => {
      toast(`Face model load failed: ${(e as Error).message}`, "error");
    });

    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      checkStatus(stored);

      // Attempt to restore in-progress session
      const session = loadSession();
      if (session) {
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
        setStage("document");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await connectWallet();
      const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
      const id = createIdentityFromSignature(sig);
      setIdentity(id);
      setStage("document");
      await checkStatus(id);
      toast("Identity created. Now verify your document.", "success");
    } catch (e) {
      toast(`Failed: ${(e as Error).message.slice(0, 100)}`, "error");
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

    while (!livenessAbortRef.current) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        setLivenessMessage("Timeout. Use Manual Confirm to proceed.");
        setLivenessActive(false);
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
                setStage("document");
                toast("Cleared. Start over from document upload.", "info");
              }
            }}
            className="shrink-0 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg border border-gray-700"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Privacy guarantee */}
      <div className="mb-6 bg-gradient-to-br from-green-950/30 to-gray-900 border border-green-800/50 rounded-xl p-4 text-sm text-gray-300">
        <strong className="font-semibold text-green-400">🔒 Zero data sent to servers.</strong> Document OCR runs via Tesseract.js in your browser. Face matching uses face-api.js loaded from our CDN. Only a cryptographic hash of extracted fields is submitted to the issuer — never the images or raw data.
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
          <button
            onClick={handleCreateIdentity}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Connect & Create Identity
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

            <dl className="space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <dt className="text-gray-500">Credential type</dt>
                <dd>{credentialType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Jurisdiction</dt>
                <dd>{extractedData.possibleCountry || "UNKNOWN"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Data hash (on-chain)</dt>
                <dd className="font-mono text-xs text-purple-300">SHA-256 commitment only</dd>
              </div>
            </dl>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg"
            >
              {submitting ? "Submitting..." : "Submit to Issuer"}
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

      <button
        onClick={onRefresh}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
      >
        Refresh Now
      </button>
    </div>
  );
}
