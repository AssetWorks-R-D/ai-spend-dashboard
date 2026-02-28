import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { vendorConfigs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
import { getAdapter } from "@/lib/adapters/registry";
import { z } from "zod/v4";
import crypto from "crypto";
import type { ApiVendor } from "@/types";

const API_VENDORS: ApiVendor[] = ["cursor", "claude", "copilot", "kiro", "replit", "openai"];

const saveCredentialsSchema = z.object({
  credentials: z.record(z.string(), z.string()),
});

/** GET /api/vendor-config/[vendor] — get config for a specific vendor */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { vendor } = await params;

  if (!API_VENDORS.includes(vendor as ApiVendor)) {
    return Response.json(
      { error: { code: "INVALID_VENDOR", message: "Unknown vendor" } },
      { status: 400 }
    );
  }

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

  if (configs.length === 0) {
    return Response.json({
      data: {
        vendor,
        hasCredentials: false,
        lastSyncAt: null,
        lastSyncStatus: null,
      },
    });
  }

  const config = configs[0];
  // Return masked credentials (just key names, not values)
  let credentialKeys: string[] = [];
  if (config.encryptedCredentials) {
    try {
      const decrypted = JSON.parse(decrypt(config.encryptedCredentials));
      credentialKeys = Object.keys(decrypted);
    } catch {
      // If decryption fails, just show no keys
    }
  }

  return Response.json({
    data: {
      vendor: config.vendor,
      hasCredentials: !!config.encryptedCredentials,
      credentialKeys,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
      stalenessThresholdMinutes: config.stalenessThresholdMinutes,
    },
  });
}

/** PUT /api/vendor-config/[vendor] — save credentials */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { vendor } = await params;

  if (!API_VENDORS.includes(vendor as ApiVendor)) {
    return Response.json(
      { error: { code: "INVALID_VENDOR", message: "Unknown vendor" } },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = saveCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const encrypted = encrypt(JSON.stringify(parsed.data.credentials));

  // Upsert — check if config already exists
  const existing = await db
    .select({ id: vendorConfigs.id })
    .from(vendorConfigs)
    .where(
      and(
        eq(vendorConfigs.tenantId, session.user.tenantId),
        eq(vendorConfigs.vendor, vendor)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(vendorConfigs)
      .set({ encryptedCredentials: encrypted, updatedAt: new Date() })
      .where(eq(vendorConfigs.id, existing[0].id));
  } else {
    await db.insert(vendorConfigs).values({
      id: crypto.randomUUID(),
      tenantId: session.user.tenantId,
      vendor,
      encryptedCredentials: encrypted,
    });
  }

  return Response.json({ data: { vendor, saved: true } });
}

/** POST /api/vendor-config/[vendor] — test connection */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ vendor: string }> }
) {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const { vendor } = await params;

  if (!API_VENDORS.includes(vendor as ApiVendor)) {
    return Response.json(
      { error: { code: "INVALID_VENDOR", message: "Unknown vendor" } },
      { status: 400 }
    );
  }

  // Get saved credentials
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
      { error: { code: "NO_ADAPTER", message: "Adapter not implemented for this vendor" } },
      { status: 501 }
    );
  }

  try {
    const credentials = JSON.parse(decrypt(configs[0].encryptedCredentials));
    const success = await adapter.testConnection({
      vendor: vendor as ApiVendor,
      credentials,
    });
    return Response.json({ data: { success } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed";
    console.error(`[vendor-config] Test connection failed for ${vendor}:`, message);
    return Response.json({ data: { success: false, message } });
  }
}
