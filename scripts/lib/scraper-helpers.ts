/**
 * Shared Playwright helpers for local scraping scripts.
 * Extracts Edge cookies, launches browser with anti-detection, and scrolls pages.
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { extractEdgeCookie } from "../extract-edge-cookie";
import { writeFileSync } from "fs";

// ─── Cookie Extraction ───────────────────────────────────────

export function extractClaudeCookies(profileDir = "Default"): { sessionKey: string; orgId: string | null } {
  const rawCookie = extractEdgeCookie("claude.ai", "sessionKey", profileDir);
  if (!rawCookie) throw new Error("Could not extract claude.ai sessionKey from Edge");

  // Strip leading garbage bytes before the actual token
  const sessionKey = rawCookie.replace(/^[^s]*?(sk-ant-sid01-)/, "$1");

  const rawOrg = extractEdgeCookie("claude.ai", "lastActiveOrg", profileDir);
  const orgId = rawOrg?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;

  return { sessionKey, orgId };
}

export function extractReplitCookie(profileDir = "Default"): string {
  const rawCookie = extractEdgeCookie("replit.com", "connect.sid", profileDir);
  if (!rawCookie) throw new Error("Could not extract replit.com connect.sid from Edge");

  // Find JWT start (may have binary prefix)
  const jwtIndex = rawCookie.indexOf("eyJ");
  return jwtIndex >= 0 ? rawCookie.substring(jwtIndex) : rawCookie;
}

// ─── Browser Context ─────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface CookieSpec {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

export async function createBrowserContext(
  cookies: CookieSpec[],
  options: { headless?: boolean } = {},
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const browser = await chromium.launch({
    headless: options.headless ?? false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies(
    cookies.map((c) => ({
      path: "/",
      secure: true,
      sameSite: "Lax" as const,
      ...c,
    })),
  );

  return { context, close: () => browser.close() };
}

export async function addAntiDetection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });
}

// ─── Page Scraping ───────────────────────────────────────────

export async function navigateAndExtractText(
  page: Page,
  url: string,
  options: {
    waitMs?: number;
    screenshotPath?: string;
    textDumpPath?: string;
    scrollSteps?: number;
  } = {},
): Promise<string> {
  const { waitMs = 8000, screenshotPath, textDumpPath, scrollSteps = 5 } = options;

  console.log(`  Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(waitMs);

  // Scroll through the page to trigger lazy-loaded content
  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved: ${screenshotPath}`);
  }

  const fullText = await page.evaluate(() => document.body.innerText);

  if (textDumpPath) {
    writeFileSync(textDumpPath, fullText, "utf8");
    console.log(`  Text dump saved: ${textDumpPath}`);
  }

  return fullText;
}

// ─── Dollar Parsing ──────────────────────────────────────────

/** Parse "$1,234.56" → 123456 (cents) */
export function parseDollarsToCents(text: string): number {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  const dollars = parseFloat(match[1].replace(/,/g, ""));
  return Math.round(dollars * 100);
}
