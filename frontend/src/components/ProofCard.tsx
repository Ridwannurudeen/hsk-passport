"use client";

interface ProofCardProps {
  merkleTreeDepth: number;
  nullifier: string;
  merkleTreeRoot: string;
  groupSize: number;
  groupName: string;
}

export function ProofCard({ merkleTreeDepth, nullifier, merkleTreeRoot, groupSize, groupName }: ProofCardProps) {
  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + "..." : s;

  return (
    <div className="bg-gradient-to-br from-purple-900/40 to-gray-900 border border-purple-700/50 rounded-xl p-5 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-semibold text-green-400">Valid Zero-Knowledge Proof</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Credential</p>
          <p className="font-medium text-purple-300">{groupName}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Merkle Depth</p>
          <p className="font-mono">{merkleTreeDepth}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Nullifier Hash</p>
          <p className="font-mono text-xs text-gray-400">{truncate(nullifier, 24)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Merkle Root</p>
          <p className="font-mono text-xs text-gray-400">{truncate(merkleTreeRoot, 24)}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-purple-800/50">
        {groupSize < 50 ? (
          <div className="text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-800 text-[10px] font-semibold">LOW ANONYMITY</span>
              <span className="text-yellow-400 font-semibold">{groupSize} member{groupSize === 1 ? "" : "s"}</span>
            </div>
            <p className="text-gray-400">
              At this size, a statistical attacker could narrow you down. Production enforces a ≥1,000 floor (see{" "}
              <a href="/roadmap" className="text-purple-300 underline hover:text-purple-200">roadmap</a>). This is a testnet demo with a small user base.
            </p>
          </div>
        ) : groupSize < 1000 ? (
          <p className="text-xs text-gray-400">
            Anonymity set: <span className="text-yellow-300 font-semibold">{groupSize}</span> members. Moderate privacy — production target is 10,000+ per jurisdiction.
          </p>
        ) : (
          <p className="text-xs text-gray-400">
            Anonymity set: <span className="text-green-300 font-semibold">{groupSize}</span> members. Strong privacy — verifier cannot narrow you down.
          </p>
        )}
      </div>
    </div>
  );
}
