"use client";

import { useEffect, useRef, useState } from "react";

interface SumsubVerificationProps {
  accessToken: string;
  levelName: string;
  onComplete: (reviewAnswer: "GREEN" | "RED" | "YELLOW") => void;
  onError?: (error: Error) => void;
  onTokenExpired?: () => Promise<string>;
}

export function SumsubVerification({
  accessToken,
  levelName,
  onComplete,
  onError,
  onTokenExpired,
}: SumsubVerificationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let snsWebSdkInstance: any = null;

    async function init() {
      try {
        // Dynamic import to avoid SSR issues. Sumsub WebSDK ships no types.
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const mod: any = await import("@sumsub/websdk");
        const snsWebSdk: any = mod.default;

        if (!containerRef.current) return;

        snsWebSdkInstance = snsWebSdk
          .init(accessToken, async () => {
            if (onTokenExpired) {
              try {
                return await onTokenExpired();
              } catch (e) {
                console.error("[Sumsub] token refresh failed:", e);
              }
            }
            return accessToken;
          })
          .withConf({
            lang: "en",
            theme: "dark",
          })
          .withOptions({
            addViewportTag: false,
            adaptIframeHeight: true,
          })
          .on("idCheck.onStepCompleted", (payload: unknown) => {
            console.log("[Sumsub] step completed:", payload);
          })
          .on("idCheck.onApplicantSubmitted", () => {
            console.log("[Sumsub] applicant submitted — awaiting review");
          })
          .on("idCheck.onApplicantLoaded", () => {
            setLoading(false);
          })
          .on("idCheck.applicantStatus", (data: { reviewResult?: { reviewAnswer?: string } }) => {
            const answer = data?.reviewResult?.reviewAnswer;
            if (answer === "GREEN" || answer === "RED" || answer === "YELLOW") {
              onComplete(answer);
            }
          })
          .on("idCheck.onError", (err: unknown) => {
            console.error("[Sumsub] error:", err);
            onError?.(new Error(typeof err === "string" ? err : "Sumsub error"));
          })
          .build();

        snsWebSdkInstance?.launch("#sumsub-websdk-container");
      } catch (e) {
        console.error("[Sumsub] init failed:", e);
        onError?.(e as Error);
        setLoading(false);
      }
    }

    init();

    return () => {
      try {
        snsWebSdkInstance?.destroy();
      } catch {
        // ignore
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, levelName]);

  return (
    <div className="w-full">
      {loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-sm text-gray-400">
          Loading Sumsub verification...
        </div>
      )}
      <div ref={containerRef} id="sumsub-websdk-container" className="w-full min-h-[600px]" />
    </div>
  );
}
