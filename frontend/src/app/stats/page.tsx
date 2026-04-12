"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGetGlobalStats, type GlobalStats } from "@/lib/api";
import { GROUPS, GROUP_NAMES, EXPLORER_URL, ADDRESSES } from "@/lib/contracts";

interface GroupStat {
  groupId: number;
  activeCount: number;
  totalIssued: number;
  totalRevoked: number;
}

export default function StatsPage() {
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [groups, setGroups] = useState<GroupStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const g = await apiGetGlobalStats();
        setGlobal(g);

        const groupData = await Promise.all(
          Object.values(GROUPS).map(async (id) => {
            try {
              const res = await fetch(`/api/groups/${id}/stats`);
              if (!res.ok) return null;
              const data = await res.json();
              return { groupId: id, ...data };
            } catch {
              return null;
            }
          })
        );
        setGroups(groupData.filter((x): x is GroupStat => x !== null));
      } catch {
        // ignore
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          Live indexer stats
        </div>
        <h1 className="text-4xl font-bold mb-3">Protocol Stats</h1>
        <p className="text-lg text-gray-400 max-w-2xl">
          Real-time metrics from the HSK Passport indexer. Updated every 30 seconds.
        </p>
      </div>

      {loading && !global && (
        <p className="text-gray-500">Loading...</p>
      )}

      {global && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-4xl font-bold text-purple-300">{global.activeCredentials}</div>
              <div className="text-xs text-gray-500 mt-1">Active credentials</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-4xl font-bold text-purple-300">{global.totalIssued}</div>
              <div className="text-xs text-gray-500 mt-1">Total issued (lifetime)</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-4xl font-bold text-purple-300">{global.activeGroups}</div>
              <div className="text-xs text-gray-500 mt-1">Active credential groups</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-4xl font-bold text-purple-300">{global.kycRequests}</div>
              <div className="text-xs text-gray-500 mt-1">KYC submissions</div>
            </div>
          </div>

          {/* Per-group */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Per-Group Breakdown</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-950/50">
                    <th className="px-6 py-3 text-left text-gray-400 font-medium">Group</th>
                    <th className="px-6 py-3 text-left text-gray-400 font-medium">ID</th>
                    <th className="px-6 py-3 text-right text-gray-400 font-medium">Active</th>
                    <th className="px-6 py-3 text-right text-gray-400 font-medium">Total Issued</th>
                    <th className="px-6 py-3 text-right text-gray-400 font-medium">Revoked</th>
                    <th className="px-6 py-3 text-right text-gray-400 font-medium">Anonymity</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.groupId} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-6 py-3 font-medium">{GROUP_NAMES[g.groupId] || `Group ${g.groupId}`}</td>
                      <td className="px-6 py-3 font-mono text-purple-300">{g.groupId}</td>
                      <td className="px-6 py-3 text-right">{g.activeCount}</td>
                      <td className="px-6 py-3 text-right text-gray-400">{g.totalIssued}</td>
                      <td className="px-6 py-3 text-right text-gray-500">{g.totalRevoked}</td>
                      <td className="px-6 py-3 text-right">
                        {g.activeCount >= 10 ? (
                          <span className="text-green-400">Good</span>
                        ) : g.activeCount >= 3 ? (
                          <span className="text-yellow-400">Weak</span>
                        ) : (
                          <span className="text-red-400">Insufficient</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Protocol contracts */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Protocol Contracts</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {[
                  ["HSKPassport", ADDRESSES.hskPassport],
                  ["CredentialRegistry", ADDRESSES.credentialRegistry],
                  ["CredentialExpiry", ADDRESSES.credentialExpiry],
                  ["CredentialReputation", ADDRESSES.credentialReputation],
                  ["Semaphore", ADDRESSES.semaphore],
                  ["DemoIssuer", ADDRESSES.demoIssuer],
                  ["HashKeyDIDBridge", ADDRESSES.hashKeyDIDBridge],
                  ["HashKeyKYCImporter", ADDRESSES.hashKeyKYCImporter],
                  ["IssuerRegistry", ADDRESSES.issuerRegistry],
                  ["Timelock", ADDRESSES.timelock],
                  ["GatedRWA (hSILVER)", ADDRESSES.gatedRWA],
                  ["KYCGatedAirdrop (hPILOT)", ADDRESSES.kycGatedAirdrop],
                  ["KYCGatedLending", ADDRESSES.kycGatedLending],
                  ["JurisdictionGatedPool", ADDRESSES.jurisdictionGatedPool],
                ].map(([name, addr]) => (
                  <div key={addr} className="flex justify-between py-1 border-b border-gray-800/30 last:border-0">
                    <span className="text-gray-400">{name}</span>
                    <a
                      href={`${EXPLORER_URL}/address/${addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-purple-300 hover:text-purple-200"
                    >
                      {addr.slice(0, 10)}...
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Network info */}
          <section className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 text-sm text-gray-400">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div><span className="text-gray-500">Network:</span> HashKey Chain Testnet</div>
              <div><span className="text-gray-500">Chain ID:</span> 133</div>
              <div><span className="text-gray-500">RPC:</span> <code className="text-purple-300">testnet.hsk.xyz</code></div>
              <div>
                <span className="text-gray-500">Explorer:</span>{" "}
                <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                  Blockscout
                </a>
              </div>
              <div>
                <Link href="/api/stats/global" className="text-purple-400 hover:text-purple-300">API</Link>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
