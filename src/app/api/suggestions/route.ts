import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { suggestions, usageRecords, members } from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { periodBounds, currentPeriodKey } from "@/lib/utils/date-ranges";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatTokens } from "@/lib/utils/format-tokens";
import { VENDOR_LABELS } from "@/lib/vendor-colors";
import type { VendorType } from "@/types";
import crypto from "crypto";

/** GET /api/suggestions?memberId=X&period=2026-02 — return cached suggestion */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");
  const period = url.searchParams.get("period") || currentPeriodKey();

  if (!memberId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "memberId is required" } },
      { status: 400 }
    );
  }

  const cached = await db
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.memberId, memberId),
        eq(suggestions.tenantId, session.user.tenantId),
        eq(suggestions.periodKey, period)
      )
    )
    .then((rows) => rows[0]);

  if (!cached) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "No cached suggestion" } },
      { status: 404 }
    );
  }

  return Response.json({
    data: {
      content: cached.content,
      generatedAt: cached.generatedAt.toISOString(),
      period,
    },
  });
}

/** POST /api/suggestions — generate a new suggestion via LLM streaming */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const memberId = body.memberId;
  const period = body.period || currentPeriodKey();

  if (!memberId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "memberId is required" } },
      { status: 400 }
    );
  }

  // Ensure user can only generate for their own memberId
  if (session.user.memberId !== memberId && session.user.role !== "admin") {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Can only generate suggestions for yourself" } },
      { status: 403 }
    );
  }

  const tenantId = session.user.tenantId;
  const { start, end } = periodBounds(period);

  // Gather member metrics
  const memberInfo = await db
    .select({ name: members.name, email: members.email })
    .from(members)
    .where(eq(members.id, memberId))
    .then((rows) => rows[0]);

  if (!memberInfo) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Member not found" } },
      { status: 404 }
    );
  }

  const usageData = await db
    .select({
      vendor: usageRecords.vendor,
      spendCents: usageRecords.spendCents,
      tokens: usageRecords.tokens,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, tenantId),
        eq(usageRecords.memberId, memberId),
        gte(usageRecords.periodStart, start),
        lte(usageRecords.periodEnd, end),
        isNotNull(usageRecords.memberId)
      )
    );

  // Aggregate by vendor
  const vendorTotals = new Map<string, { spend: number; tokens: number }>();
  for (const r of usageData) {
    const existing = vendorTotals.get(r.vendor) || { spend: 0, tokens: 0 };
    existing.spend += r.spendCents;
    existing.tokens += r.tokens || 0;
    vendorTotals.set(r.vendor, existing);
  }

  const totalSpend = Array.from(vendorTotals.values()).reduce((s, v) => s + v.spend, 0);
  const totalTokens = Array.from(vendorTotals.values()).reduce((s, v) => s + v.tokens, 0);

  // Estimate hours saved: ~1M tokens ≈ 2 hours of developer work saved
  const estimatedHoursSaved = Math.round((totalTokens / 1_000_000) * 2);

  // Build the prompt
  const vendorSummary = Array.from(vendorTotals.entries())
    .map(([v, d]) => `- ${VENDOR_LABELS[v as VendorType] || v}: ${formatCurrency(d.spend)}, ${formatTokens(d.tokens)}`)
    .join("\n");

  const firstName = memberInfo.name.split(" ")[0];

  const prompt = `You are writing a "Spotify Wrapped"-style monthly recap for an engineer's AI tool usage. The tone is playful, celebratory, a little cheeky — like a product that winks at you. Think bright startup energy, not corporate.

${firstName}'s ${period} AI usage:
Total spend: ${formatCurrency(totalSpend)}
Total tokens: ${formatTokens(totalTokens)}
Estimated hours saved: ~${estimatedHoursSaved}h
${vendorSummary || "No usage data this period."}

Write a SHORT, punchy recap (4-6 lines max) that:
1. Opens with a fun "time saved" stat or comparison (e.g. "That's enough time to binge 3 seasons of The Office" or "You automated away a full work week")
2. One silly suggestion for what to do with that free time
3. One actually useful observation or tip about their tool usage patterns
4. Close with something encouraging about their AI adoption

Rules:
- Use ${firstName}'s first name
- No emojis
- No headers or bullet points — flowing sentences, conversational
- Keep it screenshottable — something worth sharing in Slack
- Every token burned is human time redeemed — celebrate that`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: { code: "CONFIG_ERROR", message: "ANTHROPIC_API_KEY not configured" } },
      { status: 500 }
    );
  }

  // Stream response from Anthropic API
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.json().catch(() => null);
    const detail = errBody?.error?.message || anthropicRes.statusText;
    return Response.json(
      { error: { code: "LLM_ERROR", message: `Failed to generate suggestion: ${detail}` } },
      { status: 502 }
    );
  }

  // Transform SSE stream and cache on completion
  let fullContent = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "content_block_delta" && event.delta?.text) {
                fullContent += event.delta.text;
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
                );
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Cache the complete suggestion
        if (fullContent) {
          // Delete any existing suggestion for this period
          await db
            .delete(suggestions)
            .where(
              and(
                eq(suggestions.memberId, memberId),
                eq(suggestions.tenantId, tenantId),
                eq(suggestions.periodKey, period)
              )
            );

          await db.insert(suggestions).values({
            id: crypto.randomUUID(),
            memberId,
            tenantId,
            periodKey: period,
            content: fullContent,
          });
        }

        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        );
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** DELETE /api/suggestions — delete cached suggestion (for regenerate) */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");
  const period = url.searchParams.get("period") || currentPeriodKey();

  if (!memberId) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "memberId is required" } },
      { status: 400 }
    );
  }

  await db
    .delete(suggestions)
    .where(
      and(
        eq(suggestions.memberId, memberId),
        eq(suggestions.tenantId, session.user.tenantId),
        eq(suggestions.periodKey, period)
      )
    );

  return Response.json({ data: { deleted: true } });
}
