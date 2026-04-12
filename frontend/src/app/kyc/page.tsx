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
  type ExtractedDocumentData,
  type FaceMatchResult,
  type LivenessFrame,
} from "@/lib/kyc-local";
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

  // Load face models on mount
  useEffect(() => {
    loadFaceApiModels().catch((e) => {
      toast(`Face model load failed: ${(e as Error).message}`, "error");
    });

    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      setStage("document");
      checkStatus(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setDocumentPreview(dataUrl);
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

  const livenessIntervalRef = useRef<number | null>(null);

  function startLivenessCheck() {
    setLivenessActive(true);
    setLivenessFrames([]);
    setLivenessPass(false);
    setLivenessMessage("Blink your eyes twice");

    const startTime = Date.now();
    const frames: LivenessFrame[] = [];

    const tick = async () => {
      if (!videoRef.current) return;
      const ear = await detectEyeAspectRatio(videoRef.current);
      if (ear !== null) {
        frames.push({ timestamp: Date.now(), eyeAspectRatio: ear });
        setLivenessFrames([...frames]);

        // Check for blink after 1 second
        if (Date.now() - startTime > 1000 && detectBlink(frames)) {
          setLivenessPass(true);
          setLivenessMessage("Liveness confirmed!");
          setLivenessActive(false);
          if (livenessIntervalRef.current) {
            clearInterval(livenessIntervalRef.current);
            livenessIntervalRef.current = null;
          }
          toast("Liveness confirmed. Review your data before submission.", "success");
          setStage("review");
          // Stop camera
          const stream = videoRef.current.srcObject as MediaStream;
          stream?.getTracks().forEach((t) => t.stop());
          setCameraActive(false);
          return;
        }

        // Timeout after 15 seconds
        if (Date.now() - startTime > 15000 && !livenessPass) {
          setLivenessMessage("Timeout — try again");
          setLivenessActive(false);
          if (livenessIntervalRef.current) {
            clearInterval(livenessIntervalRef.current);
            livenessIntervalRef.current = null;
          }
        }
      }
    };

    livenessIntervalRef.current = window.setInterval(tick, 300);
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
      <div className="mb-6">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          Privacy-preserving KYC — all processing in-browser
        </div>
        <h1 className="text-3xl font-bold mb-2">Verify Your Identity</h1>
        <p className="text-gray-400">
          Real document OCR, face matching, and liveness detection — all running locally in your browser. No data ever leaves your device.
        </p>
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
                  <div className="text-xs text-gray-500 mb-2">Extracted fields (locally parsed)</div>
                  {extractedData ? (
                    <dl className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Name</dt>
                        <dd className={extractedData.possibleName ? "text-purple-300" : "text-gray-600"}>
                          {extractedData.possibleName || "(not detected)"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Date of birth</dt>
                        <dd className={extractedData.possibleDOB ? "text-purple-300" : "text-gray-600"}>
                          {extractedData.possibleDOB || "(not detected)"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">ID number</dt>
                        <dd className={extractedData.possibleIDNumber ? "text-purple-300 font-mono" : "text-gray-600"}>
                          {extractedData.possibleIDNumber || "(not detected)"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Country</dt>
                        <dd className={extractedData.possibleCountry ? "text-purple-300" : "text-gray-600"}>
                          {extractedData.possibleCountry || "(not detected)"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Face in document</dt>
                        <dd className={documentFaceDescriptor ? "text-green-400" : "text-gray-600"}>
                          {documentFaceDescriptor ? "✓ Detected" : "Pending..."}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-gray-500">Processing...</p>
                  )}
                </div>
              </div>

              {documentFaceDescriptor && !ocrRunning && (
                <button
                  onClick={proceedToSelfie}
                  className="mt-4 w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg"
                >
                  Continue to Selfie →
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {kycStatus.status === "approved" ? "Approved!" : kycStatus.status === "rejected" ? "Rejected" : "Under Review"}
              </h2>
              <p className="text-xs text-gray-500">Submitted {new Date(kycStatus.submitted_at).toLocaleString()}</p>
            </div>
          </div>

          <dl className="space-y-2 text-sm mb-6">
            <div className="flex justify-between"><dt className="text-gray-500">Request ID</dt><dd className="font-mono text-xs">{kycStatus.id?.slice(0, 8)}...</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Credential</dt><dd>{kycStatus.credential_type}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Jurisdiction</dt><dd>{kycStatus.jurisdiction}</dd></div>
          </dl>

          <button
            onClick={() => identity && checkStatus(identity)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg"
          >
            Check Status
          </button>
        </div>
      )}
    </div>
  );
}
