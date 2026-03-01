import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ─── Tenants ───────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  leaderboardDisplayMode: text("leaderboard_display_mode")
    .notNull()
    .default("named"), // 'named' | 'initialed' | 'anonymous'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Better Auth: User ─────────────────────────────────────────────────────────
// Better Auth core fields + custom fields (role, tenantId, memberId)

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Custom fields
    role: text("role").notNull().default("viewer"), // 'admin' | 'viewer'
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    memberId: text("member_id"), // optional FK to members (linked in Sprint 3)
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_user_tenant_id").on(table.tenantId),
    index("idx_user_email").on(table.email),
  ]
);

// ─── Better Auth: Session ──────────────────────────────────────────────────────

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_session_user_id").on(table.userId)]
);

// ─── Better Auth: Account ──────────────────────────────────────────────────────

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_account_user_id").on(table.userId)]
);

// ─── Better Auth: Verification ─────────────────────────────────────────────────

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Members (Sprint 3, but FK referenced from user) ──────────────────────────
// Forward-declared for member_id FK on user table.
// Full member schema will be expanded in Sprint 3.

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_members_tenant_id").on(table.tenantId),
    index("idx_members_email").on(table.email),
  ]
);

// ─── Member Identities (Sprint 3) ─────────────────────────────────────────────

export const memberIdentities = pgTable(
  "member_identities",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    vendor: text("vendor").notNull(), // VendorType
    vendorUsername: text("vendor_username"),
    vendorEmail: text("vendor_email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_member_identities_member_id").on(table.memberId),
    index("idx_member_identities_vendor_email").on(table.vendorEmail),
  ]
);

// ─── Usage Records (Sprint 2) ─────────────────────────────────────────────────

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    memberId: text("member_id").references(() => members.id),
    vendor: text("vendor").notNull(), // VendorType
    spendCents: integer("spend_cents").notNull(),
    tokens: integer("tokens"), // nullable — Replit may not have token data
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    confidence: text("confidence").notNull().default("high"), // 'high' | 'medium' | 'low'
    sourceType: text("source_type").notNull().default("api"), // 'api' | 'manual' | 'scraper'
    vendorUsername: text("vendor_username"),
    vendorEmail: text("vendor_email"),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
    createdBy: text("created_by"), // admin user ID for manual entries
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_usage_records_tenant_vendor").on(table.tenantId, table.vendor),
    index("idx_usage_records_tenant_member_period").on(
      table.tenantId,
      table.memberId,
      table.periodStart
    ),
  ]
);

// ─── Vendor Configs (Sprint 2) ─────────────────────────────────────────────────

export const vendorConfigs = pgTable(
  "vendor_configs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vendor: text("vendor").notNull(), // ApiVendor only
    encryptedCredentials: text("encrypted_credentials"),
    lastSyncAt: timestamp("last_sync_at"),
    lastSyncStatus: text("last_sync_status"), // 'success' | 'error' | error message
    stalenessThresholdMinutes: integer("staleness_threshold_minutes")
      .notNull()
      .default(360), // 6 hours
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_vendor_configs_tenant_vendor").on(table.tenantId, table.vendor),
  ]
);

// ─── Vendor Snapshots (Daily Diff Sync) ──────────────────────────────────────

export const vendorSnapshots = pgTable("vendor_snapshots", {
  vendor: text("vendor").primaryKey(), // VendorType
  snapshot: jsonb("snapshot").notNull(), // latest per-member cumulative data
  previousSnapshot: jsonb("previous_snapshot"), // end-of-prior-day state (diff base)
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});

// ─── Badges (Sprint 4) ────────────────────────────────────────────────────────

export const badges = pgTable(
  "badges",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    badgeType: text("badge_type").notNull(), // badge type identifier
    earnedAt: timestamp("earned_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_badges_member_id").on(table.memberId),
    index("idx_badges_tenant_id").on(table.tenantId),
  ]
);

// ─── Suggestions (Sprint 4) ───────────────────────────────────────────────────

export const suggestions = pgTable(
  "suggestions",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodKey: text("period_key").notNull(), // e.g., "2026-02"
    content: text("content").notNull(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_suggestions_member_period").on(table.memberId, table.periodKey),
    index("idx_suggestions_tenant_id").on(table.tenantId),
  ]
);
