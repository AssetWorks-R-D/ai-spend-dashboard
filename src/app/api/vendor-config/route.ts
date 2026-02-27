import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { vendorConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/vendor-config — list all vendor configs for tenant */
export async function GET() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;

  const configs = await db
    .select({
      id: vendorConfigs.id,
      vendor: vendorConfigs.vendor,
      hasCredentials: vendorConfigs.encryptedCredentials,
      lastSyncAt: vendorConfigs.lastSyncAt,
      lastSyncStatus: vendorConfigs.lastSyncStatus,
      stalenessThresholdMinutes: vendorConfigs.stalenessThresholdMinutes,
    })
    .from(vendorConfigs)
    .where(eq(vendorConfigs.tenantId, session.user.tenantId));

  // Don't expose encrypted credentials — just indicate if they're set
  const sanitized = configs.map((c) => ({
    ...c,
    hasCredentials: !!c.hasCredentials,
  }));

  return Response.json({ data: sanitized });
}
