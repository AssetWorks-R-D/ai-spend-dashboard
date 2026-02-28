import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { vendorConfigs, usageRecords, memberIdentities, members } from "@/lib/db/schema";
import { eq, and, or, gte, lte, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { getAdapter } from "@/lib/adapters/registry";
import { z } from "zod/v4";
import crypto from "crypto";
import type { ApiVendor } from "@/types";

const triggerSchema = z.object({
  vendor: z.enum(["cursor", "claude", "copilot", "kiro", "replit"]),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

/** POST /api/sync/trigger — trigger sync for a specific vendor */
export async function POST(request: NextRequest) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const body = await request.json();
  const parsed = triggerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { vendor } = parsed.data;

  // Get vendor config with credentials
  const configs = await db
    .select()
    .from(vendorConfigs)
    .where(
      and(
        eq(vendorConfigs.tenantId, session.user.tenantId),
        eq(vendorConfigs.vendor, vendor)
      )
    )
    .limit(1);

  if (configs.length === 0 || !configs[0].encryptedCredentials) {
    return Response.json(
      { error: { code: "NO_CREDENTIALS", message: "No credentials configured for this vendor" } },
      { status: 400 }
    );
  }

  const adapter = getAdapter(vendor as ApiVendor);
  if (!adapter) {
    return Response.json(
      { error: { code: "NO_ADAPTER", message: "Adapter not available" } },
      { status: 501 }
    );
  }

  // Default to current month (UTC)
  const now = new Date();
  const periodStart = parsed.data.periodStart
    ? new Date(parsed.data.periodStart)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = parsed.data.periodEnd
    ? new Date(parsed.data.periodEnd)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  try {
    const credentials = JSON.parse(decrypt(configs[0].encryptedCredentials));
    const records = await adapter.fetchUsageData(
      { vendor: vendor as ApiVendor, credentials },
      { start: periodStart, end: periodEnd }
    );

    // Delete existing API/scraper records for this vendor+period, then insert fresh
    // (preserves manual entries by only deleting api/scraper sourceTypes)
    await db
      .delete(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, session.user.tenantId),
          eq(usageRecords.vendor, vendor),
          gte(usageRecords.periodStart, periodStart),
          lte(usageRecords.periodEnd, periodEnd),
          inArray(usageRecords.sourceType, ["api", "scraper"])
        )
      );

    // Build member lookup maps from member_identities for this vendor
    const identities = await db
      .select({
        memberId: memberIdentities.memberId,
        vendorUsername: memberIdentities.vendorUsername,
        vendorEmail: memberIdentities.vendorEmail,
      })
      .from(memberIdentities)
      .where(eq(memberIdentities.vendor, vendor));

    const emailToMember = new Map<string, string>();
    const usernameToMember = new Map<string, string>();
    for (const id of identities) {
      if (id.vendorEmail) emailToMember.set(id.vendorEmail.toLowerCase(), id.memberId);
      if (id.vendorUsername) usernameToMember.set(id.vendorUsername.toLowerCase(), id.memberId);
    }

    // Also build a fallback map from member emails (for vendors like Cursor that return @assetworks emails)
    const allMembers = await db
      .select({ id: members.id, email: members.email })
      .from(members)
      .where(eq(members.tenantId, session.user.tenantId));

    const memberEmailMap = new Map<string, string>();
    for (const m of allMembers) {
      memberEmailMap.set(m.email.toLowerCase(), m.id);
    }

    for (const record of records) {
      // Resolve memberId: identity email > identity username > member email
      const memberId =
        (record.vendorEmail ? emailToMember.get(record.vendorEmail.toLowerCase()) : undefined) ??
        (record.vendorUsername ? usernameToMember.get(record.vendorUsername.toLowerCase()) : undefined) ??
        (record.vendorEmail ? memberEmailMap.get(record.vendorEmail.toLowerCase()) : undefined) ??
        null;

      await db.insert(usageRecords).values({
        id: crypto.randomUUID(),
        tenantId: session.user.tenantId,
        memberId,
        vendor: record.vendor,
        vendorUsername: record.vendorUsername,
        vendorEmail: record.vendorEmail,
        spendCents: record.spendCents,
        tokens: record.tokens,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        confidence: record.confidence,
        sourceType: record.sourceType,
      });
    }

    // Update sync status
    await db
      .update(vendorConfigs)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        updatedAt: new Date(),
      })
      .where(eq(vendorConfigs.id, configs[0].id));

    return Response.json({
      data: {
        vendor,
        recordsImported: records.length,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Update sync status with error
    await db
      .update(vendorConfigs)
      .set({
        lastSyncStatus: err instanceof Error ? err.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(vendorConfigs.id, configs[0].id));

    return Response.json(
      {
        error: {
          code: "SYNC_FAILED",
          message: err instanceof Error ? err.message : "Sync failed",
        },
      },
      { status: 500 }
    );
  }
}
