"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

const THINKING_MESSAGES = [
  "Consulting the oracle...",
  "Crunching vibes...",
  "Almost there...",
];

interface SuggestionMachineProps {
  memberId: string;
  period: string;
  memberName: string;
}

export function SuggestionMachine({ memberId, period, memberName }: SuggestionMachineProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const thinkingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCached = useCallback(async () => {
    try {
      const res = await fetch(`/api/suggestions?memberId=${memberId}&period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setContent(json.data.content);
        setGeneratedAt(json.data.generatedAt);
      }
    } finally {
      setLoading(false);
    }
  }, [memberId, period]);

  useEffect(() => {
    fetchCached();
  }, [fetchCached]);

  function startThinking() {
    setThinkingIndex(0);
    thinkingRef.current = setInterval(() => {
      setThinkingIndex((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2000);
  }

  function stopThinking() {
    if (thinkingRef.current) {
      clearInterval(thinkingRef.current);
      thinkingRef.current = null;
    }
  }

  async function generate() {
    setStreaming(true);
    setContent("");
    startThinking();

    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, period }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || "Failed to generate");
      }

      stopThinking();

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              setContent((prev) => (prev || "") + data.text);
            }
          } catch {
            // skip
          }
        }
      }

      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      stopThinking();
      setContent(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setStreaming(false);
      stopThinking();
    }
  }

  async function regenerate() {
    await fetch(`/api/suggestions?memberId=${memberId}&period=${period}`, {
      method: "DELETE",
    });
    generate();
  }

  if (loading) {
    return <div className="text-sm text-(--text-secondary)">Loading insight...</div>;
  }

  const monthLabel = new Date(period + "-01").toLocaleDateString("en-US", {
    month: "long",
  });
  const monthYearLabel = new Date(period + "-01").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // No cached content — show CTA
  if (!content && !streaming) {
    return (
      <Button variant="outline" onClick={generate} className="w-full">
        Generate your {monthLabel} insight
      </Button>
    );
  }

  // Streaming thinking state
  if (streaming && !content) {
    return (
      <div
        className="max-w-120 min-h-40 rounded-xl border p-6 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #FFFBF0 0%, #FFF5E6 100%)",
          borderColor: "#E8DFD0",
        }}
      >
        <p className="text-sm text-amber-700 animate-pulse">
          {THINKING_MESSAGES[thinkingIndex]}
        </p>
      </div>
    );
  }

  // Show content (streaming or cached)
  return (
    <div
      className="max-w-120 min-h-40 rounded-xl border p-6 space-y-4"
      style={{
        background: "linear-gradient(135deg, #FFFBF0 0%, #FFF5E6 100%)",
        borderColor: "#E8DFD0",
      }}
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700/70">
        Your {monthLabel} Insight
      </h4>
      <p className="text-sm text-(--text-primary) leading-relaxed whitespace-pre-wrap">
        {content}
        {streaming && <span className="text-amber-600 animate-pulse">|</span>}
      </p>
      <div
        className="border-t pt-3 flex items-center justify-between"
        style={{ borderColor: "#E8DFD0" }}
      >
        <span className="text-[11px] italic" style={{ color: "#A39E96" }}>
          Burnboard · {monthYearLabel}
        </span>
        {!streaming && (
          <button
            onClick={regenerate}
            className="text-[11px] font-medium text-amber-700/60 hover:text-amber-700 transition-colors"
          >
            Regenerate &#8635;
          </button>
        )}
      </div>
    </div>
  );
}

/** Truncated teaser for member cards */
export function SuggestionSnippet({
  memberId,
  period,
}: {
  memberId: string;
  period: string;
}) {
  const [snippet, setSnippet] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/suggestions?memberId=${memberId}&period=${period}`)
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((json) => {
        if (json?.data?.content) {
          const text = json.data.content;
          setSnippet(text.length > 80 ? text.slice(0, 80) + "..." : text);
        }
      });
  }, [memberId, period]);

  if (!snippet) return null;

  return (
    <p className="mt-2 text-xs text-(--text-secondary) italic line-clamp-2">
      {snippet}
    </p>
  );
}
