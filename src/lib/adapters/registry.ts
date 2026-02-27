import type { ApiVendor } from "@/types";
import type { VendorAdapter } from "./types";
import { cursorAdapter } from "./cursor";
import { claudeAdapter } from "./claude";
import { copilotAdapter } from "./copilot";
import { kiroAdapter } from "./kiro";
import { replitAdapter } from "./replit";

const adapters = new Map<ApiVendor, VendorAdapter>([
  ["cursor", cursorAdapter],
  ["claude", claudeAdapter],
  ["copilot", copilotAdapter],
  ["kiro", kiroAdapter],
  ["replit", replitAdapter],
]);

export function getAdapter(vendor: ApiVendor): VendorAdapter | undefined {
  return adapters.get(vendor);
}

export function getAllAdapters(): VendorAdapter[] {
  return Array.from(adapters.values());
}
