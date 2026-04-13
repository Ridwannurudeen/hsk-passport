export default function ResearchPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-yellow-400 border border-yellow-700 rounded-full bg-yellow-950/30">
        Research Mode — Not a verification path
      </div>
      <h1 className="text-3xl font-bold mb-3">In-Browser KYC Architecture</h1>
      <p className="text-gray-400 mb-6">
        An exploration of what&apos;s possible when the entire KYC pipeline runs client-side. This is
        not production KYC and is not the path to a live credential — for that, use{" "}
        <a href="/kyc" className="text-purple-300 hover:text-purple-200 underline">Sumsub verification</a>.
      </p>

      <div className="mb-8 bg-red-950/30 border border-red-800/50 rounded-xl p-5 text-sm">
        <strong className="block text-red-300 mb-2 text-base">Why this is not real KYC</strong>
        <p className="text-gray-300 mb-3">
          A demo user can bypass this flow with a printed photo, a deepfake video, a forged ID, or
          by simply reusing a face across wallets. The browser cannot:
        </p>
        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
          <li>Detect MRZ/chip/hologram authenticity on a passport</li>
          <li>Run iBeta L2 passive liveness (skin depth, Moiré, micro-movement)</li>
          <li>Detect injection attacks (virtual cameras, OBS, emulators)</li>
          <li>Dedup faces across an applicant database</li>
          <li>Check government / PEP / sanctions lists</li>
        </ul>
      </div>

      <div className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">What it does demonstrate</h2>
        <ul className="text-sm text-gray-300 space-y-2 list-disc list-inside">
          <li><strong className="text-gray-100">Tesseract.js</strong> — real OCR of passport/ID fields in WebAssembly</li>
          <li><strong className="text-gray-100">face-api.js</strong> — 128-dim face descriptor + doc↔selfie match distance</li>
          <li><strong className="text-gray-100">Adaptive blink detection</strong> — eye aspect ratio over time with auto-calibrated baseline</li>
          <li><strong className="text-gray-100">Zero-data-to-server architecture</strong> — only a SHA-256 hash of extracted fields ever leaves the browser</li>
          <li><strong className="text-gray-100">Session resume</strong> — IndexedDB-backed stage persistence across tab close/reload</li>
        </ul>
        <p className="text-xs text-gray-500 mt-4">
          Useful as a template for privacy-first on-device flows (e.g., age attestation, country-of-residence proofs) where identity strength is not the threat model. We are <em>not</em> using it in the production HSK Passport KYC path.
        </p>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 text-sm">
        <strong className="block text-white mb-2">Production path for HSK Passport:</strong>
        <ol className="list-decimal list-inside text-gray-400 space-y-1">
          <li>User opens <a href="/kyc" className="text-purple-300 hover:text-purple-200 underline">/kyc</a></li>
          <li>Sumsub SDK runs (iBeta L2 liveness, document forensics, dedup)</li>
          <li>Sumsub issues GREEN webhook → backend auto-triggers issuer</li>
          <li>Credential minted on-chain, bound to the user&apos;s Semaphore commitment</li>
          <li>User proves eligibility to any dApp via <a href="/demo" className="text-purple-300 hover:text-purple-200 underline">zero-knowledge proof</a></li>
        </ol>
      </div>
    </div>
  );
}
