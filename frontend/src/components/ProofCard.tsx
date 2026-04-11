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
        <p className="text-xs text-gray-400">
          Your identity is hidden among <span className="text-purple-300 font-semibold">{groupSize}</span> members.
          The verifier learns nothing about which member you are.
        </p>
      </div>
    </div>
  );
}
