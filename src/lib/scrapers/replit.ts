/**
 * Replit Usage Scraper
 *
 * Two modes:
 *   1. Cookie mode — uses a pre-captured connect.sid session cookie
 *   2. Edge mode — launches Edge with the user's existing profile (already logged in)
 *
 * Edge mode requires Edge to be closed before running.
 * Cookie mode works anywhere (including Vercel, if Playwright is available).
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";

export interface ReplitUsageRow {
  username: string;
  email: string | null;
  spendCents: number;
  category: string;
}

export interface ReplitScrapeResult {
  rows: ReplitUsageRow[];
  teamName: string | null;
  screenshotPaths: string[];
  error?: string;
}

interface BrowserSession {
  page: Page;
  close: () => Promise<void>;
}

// ─── Browser launchers ──────────────────────────────────────────────

/** Launch Chromium with a session cookie pre-set */
async function launchWithCookie(sessionCookie: string): Promise<BrowserSession> {
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
      value: sessionCookie,
      domain: ".replit.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  return { page, close: () => browser.close() };
}

/**
 * Launch Edge using the user's existing profile (already logged into Replit).
 * Edge must be closed before calling this.
 */
async function launchWithEdge(
  profileDir = "Profile 1",
): Promise<BrowserSession & { context: BrowserContext }> {
  const userDataDir = join(
    homedir(),
    "Library/Application Support/Microsoft Edge",
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "msedge",
    headless: false,
    args: [
      `--profile-directory=${profileDir}`,
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  return { page, context, close: () => context.close() };
}

// ─── Shared scraping logic ──────────────────────────────────────────

async function scrapeWithSession(
  session: BrowserSession,
  teamSlug?: string,
): Promise<ReplitScrapeResult> {
  const { page } = session;
  const screenshotPaths: string[] = [];

  // Collect GraphQL responses
  const graphqlResponses: { url: string; body: unknown }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("graphql") || url.includes("/api/")) {
      try {
        const json = await response.json();
        graphqlResponses.push({ url, body: json });
      } catch {
        // Not JSON
      }
    }
  });

  // Check if session is valid
  await page.goto("https://replit.com/~", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  if (page.url().includes("/login")) {
    return {
      rows: [],
      teamName: teamSlug || null,
      screenshotPaths: [],
      error: "Not logged in — session expired or Edge profile not signed in",
    };
  }

  // Navigate to usage page
  const usageUrl = teamSlug
    ? `https://replit.com/team/${teamSlug}/usage`
    : "https://replit.com/usage";
  await page.goto(usageUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  const usageShot = "/tmp/replit-usage-scrape.png";
  await page.screenshot({ path: usageShot, fullPage: true });
  screenshotPaths.push(usageShot);

  let rows = await scrapeUsagePage(page);

  // Try GraphQL responses
  if (rows.length === 0) {
    rows = parseGraphQLResponses(graphqlResponses);
  }

  // Try team analytics
  if (rows.length === 0 && teamSlug) {
    await page.goto(`https://replit.com/team/${teamSlug}/analytics`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);
    const analyticsShot = "/tmp/replit-analytics-scrape.png";
    await page.screenshot({ path: analyticsShot, fullPage: true });
    screenshotPaths.push(analyticsShot);
    rows = await scrapeUsagePage(page);
  }

  // Try /account billing
  if (rows.length === 0) {
    await page.goto("https://replit.com/account", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const accountShot = "/tmp/replit-account-scrape.png";
    await page.screenshot({ path: accountShot, fullPage: true });
    screenshotPaths.push(accountShot);
    rows = await scrapeUsagePage(page);
  }

  return {
    rows,
    teamName: teamSlug || null,
    screenshotPaths,
    error:
      rows.length === 0
        ? `No usage data found. Captured ${graphqlResponses.length} API responses. Screenshots: ${screenshotPaths.join(", ")}`
        : undefined,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Scrape Replit usage using a session cookie.
 */
export async function scrapeReplitUsage(
  sessionCookie: string,
  teamSlug?: string,
): Promise<ReplitScrapeResult> {
  const session = await launchWithCookie(sessionCookie);
  try {
    return await scrapeWithSession(session, teamSlug);
  } finally {
    await session.close();
  }
}

/**
 * Scrape Replit usage using Edge's existing session (no cookie needed).
 * Edge must be closed before calling this.
 */
export async function scrapeReplitUsageWithEdge(
  teamSlug?: string,
  profileDir = "Profile 1",
): Promise<ReplitScrapeResult> {
  let session: BrowserSession & { context: BrowserContext };
  try {
    session = await launchWithEdge(profileDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("lock") || msg.includes("already running") || msg.includes("SingletonLock")) {
      return {
        rows: [],
        teamName: teamSlug || null,
        screenshotPaths: [],
        error: "Edge is still running. Close Edge completely and try again.",
      };
    }
    throw err;
  }

  try {
    return await scrapeWithSession(session, teamSlug);
  } finally {
    await session.close();
  }
}

/**
 * Capture the connect.sid cookie from Edge's existing Replit session.
 * Useful for getting a cookie to store in vendor config for API-based syncs.
 * Edge must be closed.
 */
export async function captureReplitCookieFromEdge(
  profileDir = "Profile 1",
): Promise<{ cookie: string | null; error?: string }> {
  let session: BrowserSession & { context: BrowserContext };
  try {
    session = await launchWithEdge(profileDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("lock") || msg.includes("already running") || msg.includes("SingletonLock")) {
      return { cookie: null, error: "Edge is still running. Close it first." };
    }
    throw err;
  }

  try {
    const { page, context } = session;

    await page.goto("https://replit.com/~", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      return { cookie: null, error: "Not logged into Replit in Edge. Log in manually first." };
    }

    const cookies = await context.cookies("https://replit.com");
    const sid = cookies.find((c) => c.name === "connect.sid");

    return sid
      ? { cookie: sid.value }
      : { cookie: null, error: "Logged in but connect.sid cookie not found" };
  } finally {
    await session.close();
  }
}

// ─── Page scraping strategies ───────────────────────────────────────

async function scrapeUsagePage(page: Page): Promise<ReplitUsageRow[]> {
  const rows: ReplitUsageRow[] = [];

  // Strategy 1: Tables
  const tableRows = await page.locator("table tbody tr").all();
  if (tableRows.length > 0) {
    for (const row of tableRows) {
      const cells = await row.locator("td").allTextContents();
      if (cells.length >= 2) {
        const label = cells[0]?.trim() || "";
        const spendText = cells.find((c) => c.includes("$"));
        const spendCents = parseDollars(spendText || "");
        if (label && spendCents > 0) {
          rows.push({
            username: label,
            email: null,
            spendCents,
            category: cells.length > 2 ? cells[1]?.trim() || "total" : "total",
          });
        }
      }
    }
    if (rows.length > 0) return rows;
  }

  // Strategy 2: Look for dollar amounts in visible text elements
  const textEls = await page
    .locator("p, span, div, h1, h2, h3, h4, td, li")
    .all();
  const seen = new Set<string>();

  for (const el of textEls) {
    try {
      const text = (await el.innerText().catch(() => "")).trim();
      if (!text || !text.includes("$") || text.length > 300 || seen.has(text))
        continue;
      seen.add(text);

      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const dollarMatch = line.match(/\$([\d,]+\.?\d*)/);
        if (!dollarMatch) continue;
        const cents = parseDollars(dollarMatch[0]);
        if (cents <= 0) continue;

        const label =
          line
            .replace(dollarMatch[0], "")
            .trim()
            .replace(/[:\-–]+$/, "")
            .trim() || "unknown";
        if (label.length < 80) {
          rows.push({
            username: "team",
            email: null,
            spendCents: cents,
            category: label,
          });
        }
      }
    } catch {
      // skip
    }
  }

  // Deduplicate
  const deduped = new Map<string, ReplitUsageRow>();
  for (const row of rows) {
    const key = `${row.category}:${row.spendCents}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return Array.from(deduped.values());
}

/** Extract spend data from intercepted GraphQL responses */
function parseGraphQLResponses(
  responses: { url: string; body: unknown }[],
): ReplitUsageRow[] {
  const rows: ReplitUsageRow[] = [];

  for (const { body } of responses) {
    if (!body || typeof body !== "object") continue;
    const jsonStr = JSON.stringify(body);

    if (
      jsonStr.includes("cost") ||
      jsonStr.includes("spend") ||
      jsonStr.includes("usage") ||
      jsonStr.includes("billing")
    ) {
      walkObject(body, (key, value) => {
        if (
          typeof value === "number" &&
          (key.includes("cost") ||
            key.includes("spend") ||
            key.includes("amount") ||
            key.includes("total"))
        ) {
          rows.push({
            username: "team",
            email: null,
            spendCents: value > 1000 ? value : Math.round(value * 100),
            category: key,
          });
        }
      });
    }
  }

  return rows;
}

function walkObject(
  obj: unknown,
  fn: (key: string, value: unknown, path: string) => void,
  path = "",
) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++)
      walkObject(obj[i], fn, `${path}[${i}]`);
  } else {
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>,
    )) {
      const fullPath = path ? `${path}.${key}` : key;
      fn(key, value, fullPath);
      walkObject(value, fn, fullPath);
    }
  }
}

function parseDollars(text: string): number {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  const dollars = parseFloat(match[1].replace(",", ""));
  return isNaN(dollars) ? 0 : Math.round(dollars * 100);
}
