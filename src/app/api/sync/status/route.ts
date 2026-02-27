import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { vendorConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { VendorType } from "@/types";

const ALL_VENDORS: VendorType[] = ["cursor", "claude", "copilot", "kiro", "replit"];

/** GET /api/sync/status — per-vendor sync status */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const configs = await db
    .select({
      vendor: vendorConfigs.vendor,
      lastSyncAt: vendorConfigs.lastSyncAt,
      lastSyncStatus: vendorConfigs.lastSyncStatus,
      stalenessThresholdMinutes: vendorConfigs.stalenessThresholdMinutes,
    })
    .from(vendorConfigs)
    .where(eq(vendorConfigs.tenantId, session.user.tenantId));

  const configMap = new Map(configs.map((c) => [c.vendor, c]));
  const now = Date.now();

  const statuses = ALL_VENDORS.map((vendor) => {
    const config = configMap.get(vendor);
    if (!config) {
      return {
        vendor,
        lastSyncAt: null,
        lastSyncStatus: null,
        isStale: true,
        sourceType: vendor === "replit" ? "manual" : "api",
      };
    }

    const lastSync = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
    const threshold = (config.stalenessThresholdMinutes || 360) * 60 * 1000;
    const isStale = !lastSync || now - lastSync > threshold;

    return {
      vendor,
      lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: config.lastSyncStatus,
      isStale,
      sourceType: vendor === "replit" ? "manual" : "api",
    };
  });

  return Response.json({ data: statuses });
}
