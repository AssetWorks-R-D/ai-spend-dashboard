export type ApiVendor = "cursor" | "claude" | "copilot" | "kiro" | "replit" | "openai";
export type VendorType = ApiVendor;
export type SourceType = "api" | "manual" | "scraper";
export type Confidence = "high" | "medium" | "low";
export type UserRole = "admin" | "viewer";
export type LeaderboardDisplayMode = "named" | "initialed" | "anonymous";

export interface ApiResponse<T> {
  data: T;
  meta?: VendorSyncMeta;
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface VendorSyncMeta {
  vendors: Record<
    VendorType,
    {
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
      isStale: boolean;
    }
  >;
}

export interface DateRange {
  start: Date;
  end: Date;
}
