#!/usr/bin/env npx tsx
/**
 * Screenshots the Claude Team usage page using a session cookie from Edge.
 */
import { chromium } from "playwright";
import { extractEdgeCookie } from "./extract-edge-cookie";

async function main() {
  // Extract session cookie from Edge
  const rawCookie = extractEdgeCookie("claude.ai", "sessionKey", "Default");
  if (!rawCookie) {
    console.error("Could not extract claude.ai sessionKey from Edge");
    process.exit(1);
  }

  // The decrypted value may have leading garbage bytes before the actual token
  const sessionKey = rawCookie.replace(/^[^s]*?(sk-ant-sid01-)/, "$1");
  console.log(`Session key: ${sessionKey.substring(0, 30)}...`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  // Extract lastActiveOrg (UUID format)
  const rawOrg = extractEdgeCookie("claude.ai", "lastActiveOrg", "Default");
  const orgMatch = rawOrg?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  const orgId = orgMatch?.[1];
  if (orgId) console.log(`lastActiveOrg: ${orgId}`);

  const cookies: Parameters<typeof context.addCookies>[0] = [
    {
      name: "sessionKey",
      value: sessionKey,
      domain: ".claude.ai",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ];

  if (orgId) {
    cookies.push({
      name: "lastActiveOrg",
      value: orgId,
      domain: ".claude.ai",
      path: "/",
      secure: true,
      sameSite: "Lax",
    });
  }

  await context.addCookies(cookies);

  const page = await context.newPage();

  // Remove automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  console.log("Navigating to Claude admin usage page...");
  await page.goto("https://claude.ai/admin-settings/usage", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  // Wait for page to render fully
  await page.waitForTimeout(8000);

  const url = page.url();
  console.log(`Current URL: ${url}`);

  // Scroll to the user spend table
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/tmp/claude-usage-table1.png", fullPage: false });
  console.log("Screenshot 1 (table top) saved");

  // Scroll further to see more users
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/claude-usage-table2.png", fullPage: false });
  console.log("Screenshot 2 (table mid) saved");

  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/claude-usage-table3.png", fullPage: false });
  console.log("Screenshot 3 (table bottom) saved");

  // Also grab the full page text to extract all user data
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const fullText = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== FULL PAGE TEXT ===\n${fullText}\n`);

  await browser.close();
}

main().catch(console.error);
