#!/usr/bin/env npx tsx
import { chromium } from "playwright";

async function main() {
  const email = process.env.REPLIT_EMAIL!;
  const password = process.env.REPLIT_PASSWORD!;

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  console.log("Navigating to login...");
  await page.goto("https://replit.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log("Filling credentials...");
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  await page.screenshot({ path: "/tmp/replit-before-submit.png", fullPage: true });
  console.log("Screenshot before submit: /tmp/replit-before-submit.png");

  console.log("Clicking Log In...");
  await page.locator('button:has-text("Log In")').click();

  // Wait and screenshot to see what happens
  await page.waitForTimeout(8000);

  const url = page.url();
  const title = await page.title();
  console.log(`After login — URL: ${url}, Title: ${title}`);

  await page.screenshot({ path: "/tmp/replit-after-submit.png", fullPage: true });
  console.log("Screenshot after submit: /tmp/replit-after-submit.png");

  // Check for error messages
  const errorText = await page.locator('[class*="error"], [role="alert"], .error').allTextContents();
  if (errorText.length > 0) {
    console.log("Error messages:", errorText);
  }

  await browser.close();
}

main().catch(console.error);
