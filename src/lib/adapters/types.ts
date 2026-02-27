import type { ApiVendor, Confidence, SourceType, DateRange } from "@/types";

export interface VendorConfig {
  vendor: ApiVendor;
  credentials: Record<string, string>;
}

export interface UsageRecord {
  vendor: ApiVendor;
  vendorUsername: string | null;
  vendorEmail: string | null;
  spendCents: number;
  tokens: number | null;
  periodStart: Date;
  periodEnd: Date;
  confidence: Confidence;
  sourceType: SourceType;
}

export interface VendorAdapter {
  vendor: ApiVendor;
  fetchUsageData(config: VendorConfig, dateRange: DateRange): Promise<UsageRecord[]>;
  testConnection(config: VendorConfig): Promise<boolean>;
}
