"use client";

import { useEffect, useRef, useState } from "react";
import { apiGetHealth, type HealthReport } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

const COLORS: Record<"ok" | "warn" | "error" | "loading", string> = {
  ok: "var(--success)",
  warn: "#f59e0b",
  error: "#ef4444",
  loading: "var(--text-subtle)",
};

const LABELS: Record<"ok" | "warn" | "error" | "loading", string> = {
  ok: "All systems operational",
  warn: "Indexer slightly behind",
  error: "Indexer degraded",
  loading: "Checking systems…",
};

function describe(report: HealthReport): string {
  const lines: string[] = [];
  lines.push(`Status: ${report.status.toUpperCase()}`);
  lines.push(`Indexer lag: ${report.indexer.lagBlocks} blocks`);
  if (report.indexer.secondsSinceSync !== null) {
    lines.push(`Last sync: ${report.indexer.secondsSinceSync}s ago`);
  }
  lines.push(`Testnet RPC: ${report.rpc.testnet.ok ? `${report.rpc.testnet.latencyMs}ms` : "down"}`);
  lines.push(`Mainnet RPC: ${report.rpc.mainnet.ok ? `${report.rpc.mainnet.latencyMs}ms` : "down"}`);
  if (report.indexer.lastError) lines.push(`Last error: ${report.indexer.lastError}`);
  return lines.join("\n");
}

export function HealthIndicator() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await apiGetHealth();
        if (cancelled.current) return;
        setReport(r);
        setLoading(false);
      } catch {
        if (cancelled.current) return;
        // Treat fetch failure as error state — backend is unreachable.
        setReport(null);
        setLoading(false);
      }
      if (!cancelled.current) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const state: "ok" | "warn" | "error" | "loading" = loading
    ? "loading"
    : report
      ? report.status
      : "error";

  const label = report === null && !loading ? "API unreachable" : LABELS[state];
  const tooltip = report ? describe(report) : label;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={tooltip}
      aria-label={label}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${state === "loading" ? "" : "animate-pulse"}`}
        style={{ background: COLORS[state] }}
      />
      {label}
    </span>
  );
}
