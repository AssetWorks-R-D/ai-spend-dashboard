import type { VendorType } from "@/types";

export interface VendorColor {
  primary: string;
  accent: string;
  background: string;
  textOnPrimary: string;
}

export const VENDOR_COLORS: Record<VendorType, VendorColor> = {
  cursor: {
    primary: "#1a1a2e",
    accent: "#6C63FF",
    background: "#F0F0F5",
    textOnPrimary: "#FFFFFF",
  },
  claude: {
    primary: "#D97706",
    accent: "#F59E0B",
    background: "#FFF8F0",
    textOnPrimary: "#FFFFFF",
  },
  copilot: {
    primary: "#22c55e",
    accent: "#16a34a",
    background: "#F0FFF4",
    textOnPrimary: "#FFFFFF",
  },
  replit: {
    primary: "#F26522",
    accent: "#0E1525",
    background: "#FFF3ED",
    textOnPrimary: "#FFFFFF",
  },
  kiro: {
    primary: "#7C3AED",
    accent: "#8B5CF6",
    background: "#F5F0FF",
    textOnPrimary: "#FFFFFF",
  },
  openai: {
    primary: "#10A37F",
    accent: "#0D8C6D",
    background: "#F0FDF9",
    textOnPrimary: "#FFFFFF",
  },
};

export const VENDOR_LABELS: Record<VendorType, string> = {
  cursor: "Cursor",
  claude: "Claude",
  copilot: "Copilot",
  replit: "Replit",
  kiro: "Kiro",
  openai: "OpenAI",
};
