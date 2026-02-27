#!/usr/bin/env npx tsx
/**
 * Navigate to the Claude Organization page to find member seat types.
 * Also intercepts API responses to capture member data.
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
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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

  // Intercept API responses to capture member/seat data
  const apiData: { url: string; body: unknown }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") && (url.includes("member") || url.includes("seat") || url.includes("user") || url.includes("org"))) {
      try {
        const json = await response.json();
        apiData.push({ url, body: json });
      } catch {}
    }
  });

  // Go directly to organization page
  console.log("Navigating to organization page...");
  await page.goto("https://claude.ai/admin-settings/organization", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(6000);

  const orgText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: "/tmp/claude-org-0.png" });

  // Look for the members section - check for links with member-related text
  const allLinks = await page.evaluate(() => {
    const links: { text: string; href: string }[] = [];
    document.querySelectorAll("a, button").forEach((el) => {
      const text = (el.textContent || "").trim();
      const href = (el as HTMLAnchorElement).href || "";
      if (text && (text.toLowerCase().includes("member") || text.toLowerCase().includes("manage") || text.toLowerCase().includes("seat") || text.toLowerCase().includes("user"))) {
        links.push({ text: text.substring(0, 100), href });
      }
    });
    return links;
  });
  console.log("Member-related links:", JSON.stringify(allLinks, null, 2));

  // Print organization page text (filtered to admin settings content)
  const orgContent = orgText.split("Organization settings")[1] || orgText;
  console.log(`\n=== ORG PAGE ===\n${orgContent.substring(0, 3000)}\n`);

  // Now try to find the members list - look at the "Members" section in sidebar
  // Check all nav links
  const navLinks = await page.evaluate(() => {
    const links: { text: string; href: string }[] = [];
    document.querySelectorAll("nav a, [role='navigation'] a, aside a").forEach((el) => {
      links.push({
        text: (el.textContent || "").trim(),
        href: (el as HTMLAnchorElement).href || "",
      });
    });
    return links;
  });
  console.log("Nav links:", JSON.stringify(navLinks.filter(l => l.text.length > 0 && l.text.length < 50), null, 2));

  // Try to find the icon-based sidebar links (the left icon bar)
  const iconLinks = await page.evaluate(() => {
    const links: { ariaLabel: string; href: string; title: string }[] = [];
    document.querySelectorAll("a[aria-label], a[title], button[aria-label]").forEach((el) => {
      links.push({
        ariaLabel: el.getAttribute("aria-label") || "",
        href: (el as HTMLAnchorElement).href || "",
        title: el.getAttribute("title") || "",
      });
    });
    return links;
  });
  console.log("Icon links:", JSON.stringify(iconLinks.filter(l => l.ariaLabel || l.title), null, 2));

  // Print intercepted API data
  if (apiData.length > 0) {
    console.log(`\n=== INTERCEPTED API RESPONSES: ${apiData.length} ===`);
    for (const d of apiData) {
      console.log(`\nURL: ${d.url}`);
      console.log(JSON.stringify(d.body, null, 2).substring(0, 3000));
    }
  }

  await browser.close();
}

main().catch(console.error);
