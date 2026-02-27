#!/usr/bin/env npx tsx
/**
 * Scrapes the Claude Team members/identity page to get seat types (standard vs premium).
 */
import { chromium } from "playwright";
import { extractEdgeCookie } from "./extract-edge-cookie";

async function main() {
  const rawCookie = extractEdgeCookie("claude.ai", "sessionKey", "Default");
  if (!rawCookie) { console.error("No sessionKey"); process.exit(1); }
  const sessionKey = rawCookie.replace(/^[^s]*?(sk-ant-sid01-)/, "$1");

  const rawOrg = extractEdgeCookie("claude.ai", "lastActiveOrg", "Default");
  const orgId = rawOrg?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1];

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const cookies: Parameters<typeof context.addCookies>[0] = [
    { name: "sessionKey", value: sessionKey, domain: ".claude.ai", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
  ];
  if (orgId) cookies.push({ name: "lastActiveOrg", value: orgId, domain: ".claude.ai", path: "/", secure: true, sameSite: "Lax" });
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  // Navigate to identity & access page (shows member roles/types)
  console.log("Navigating to Identity and access page...");
  await page.goto("https://claude.ai/admin-settings/identity-and-access", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(8000);

  const url = page.url();
  console.log(`URL: ${url}`);

  // Take screenshots scrolling through the member list
  for (let i = 0; i < 4; i++) {
    await page.screenshot({ path: `/tmp/claude-members-${i}.png`, fullPage: false });
    console.log(`Screenshot ${i} saved`);
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);
  }

  // Get full text
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const fullText = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== FULL PAGE TEXT ===\n${fullText}\n`);

  // Also check billing page for pricing info
  console.log("Navigating to Billing page...");
  await page.goto("https://claude.ai/admin-settings/billing", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(6000);

  await page.screenshot({ path: "/tmp/claude-billing.png", fullPage: false });
  const billingText = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== BILLING PAGE TEXT ===\n${billingText}\n`);

  await browser.close();
}

main().catch(console.error);
