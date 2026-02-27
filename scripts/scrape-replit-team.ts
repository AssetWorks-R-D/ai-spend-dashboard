#!/usr/bin/env npx tsx
/**
 * Scrapes Replit team data: members, repls, and usage.
 * Uses the connect.sid cookie extracted from Edge.
 */
import { chromium } from "playwright";

const JWT = process.env.REPLIT_COOKIE || process.argv[2] || '';

async function main() {
  if (!JWT) {
    console.error("Usage: REPLIT_COOKIE=... npx tsx scripts/scrape-replit-team.ts");
    process.exit(1);
  }

  const teamSlug = "assetworks-randd";
  const results: Record<string, unknown[]> = {
    members: [],
    repls: [],
    usage: [],
  };

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies([
    {
      name: "connect.sid",
      value: JWT,
      domain: "replit.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "replit_authed",
      value: "1",
      domain: "replit.com",
      path: "/",
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  // Remove automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });

  // Intercept all GraphQL responses
  const graphqlData: { url: string; body: unknown; operationName?: string }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("graphql")) {
      try {
        const json = await response.json();
        const req = response.request();
        let opName: string | undefined;
        try {
          const postData = req.postData();
          if (postData) {
            const parsed = JSON.parse(postData);
            opName = parsed.operationName || parsed[0]?.operationName;
          }
        } catch {}
        graphqlData.push({ url, body: json, operationName: opName });
      } catch {}
    }
  });

  // === MEMBERS PAGE ===
  console.log("Scraping members page...");
  await page.goto(`https://replit.com/t/${teamSlug}/members`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/replit-members-pw.png", fullPage: true });

  // Extract member data from the rendered DOM
  const memberData = await page.evaluate(() => {
    const members: { name: string; username: string; role: string; avatar: string }[] = [];
    // Look for member list items - Replit renders members in a list/table
    const memberEls = document.querySelectorAll('[data-testid*="member"], [class*="member"], tr, [role="row"]');
    memberEls.forEach((el) => {
      const text = el.textContent || "";
      if (text.includes("@") || text.includes("Admin") || text.includes("Member")) {
        members.push({
          name: text.trim().substring(0, 200),
          username: "",
          role: text.includes("Admin") ? "admin" : "member",
          avatar: "",
        });
      }
    });

    // Also try to get all visible usernames
    const allText = document.body.innerText;
    return { members, pageText: allText.substring(0, 10000) };
  });

  console.log(`Members page text (first 3000 chars):\n${memberData.pageText.substring(0, 3000)}\n`);

  // === REPLS PAGE ===
  console.log("Scraping repls page...");
  await page.goto(`https://replit.com/t/${teamSlug}/repls`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/replit-repls-pw.png", fullPage: true });

  const replsData = await page.evaluate(() => {
    return { pageText: document.body.innerText.substring(0, 10000) };
  });

  console.log(`Repls page text (first 3000 chars):\n${replsData.pageText.substring(0, 3000)}\n`);

  // === USAGE PAGE ===
  console.log("Scraping usage page...");
  await page.goto(`https://replit.com/t/${teamSlug}/usage`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  // Try to expand the "Agent Usage" section
  try {
    const agentBtn = page.locator("text=Agent Usage").first();
    if (await agentBtn.isVisible()) {
      await agentBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch {}

  await page.screenshot({ path: "/tmp/replit-usage-pw.png", fullPage: true });

  const usageData = await page.evaluate(() => {
    return { pageText: document.body.innerText.substring(0, 15000) };
  });

  console.log(`Usage page text (first 5000 chars):\n${usageData.pageText.substring(0, 5000)}\n`);

  // === GRAPHQL DATA ===
  console.log(`\n=== Captured ${graphqlData.length} GraphQL responses ===`);
  for (const gql of graphqlData) {
    console.log(`\nOperation: ${gql.operationName || 'unknown'}`);
    console.log(JSON.stringify(gql.body, null, 2).substring(0, 2000));
  }

  await browser.close();
}

main().catch(console.error);
