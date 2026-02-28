#!/usr/bin/env npx tsx
/**
 * Extracts and decrypts a cookie from Edge's cookie store on macOS.
 * Works while Edge is running (reads a copy of the DB).
 *
 * Usage:
 *   npx tsx scripts/extract-edge-cookie.ts <domain> <cookieName> [profileDir]
 *   npx tsx scripts/extract-edge-cookie.ts replit.com connect.sid
 */
import { execSync } from "child_process";
import { copyFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { pbkdf2Sync, createDecipheriv } from "crypto";

function getEdgeSafeStoragePassword(): string {
  return execSync(
    'security find-generic-password -w -s "Microsoft Edge Safe Storage" -a "Microsoft Edge"',
    { encoding: "utf8" },
  ).trim();
}

function decryptEdgeCookie(encryptedHex: string, password: string): string {
  const encrypted = Buffer.from(encryptedHex, "hex");

  // Chrome/Edge cookies on macOS: first 3 bytes are "v10" or "v11"
  const version = encrypted.subarray(0, 3).toString("utf8");
  if (version !== "v10" && version !== "v11") {
    throw new Error(`Unexpected cookie version: ${version}`);
  }

  const ciphertext = encrypted.subarray(3);

  // Derive key using PBKDF2
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");

  // Decrypt with AES-128-CBC, IV = 16 spaces
  const iv = Buffer.alloc(16, 0x20); // 16 space characters
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  // Convert to latin1 first (preserves byte values), then strip
  // any non-printable/non-ASCII bytes that Chrome's encryption adds
  const raw = decrypted.toString("latin1");

  // Keep only printable ASCII characters (0x20-0x7E)
  const cleaned = raw.replace(/[^\x20-\x7E]/g, "");
  return cleaned;
}

export function extractEdgeCookie(
  domain: string,
  cookieName: string,
  profileDir = "Default",
): string | null {
  const edgeDir = join(homedir(), "Library/Application Support/Microsoft Edge");
  const cookiesDb = join(edgeDir, profileDir, "Cookies");

  if (!existsSync(cookiesDb)) {
    console.error(`Cookie DB not found: ${cookiesDb}`);
    return null;
  }

  // Copy to temp to avoid locking issues
  const tmpDb = "/tmp/edge-cookies-extract";
  copyFileSync(cookiesDb, tmpDb);

  // Also copy WAL/SHM if they exist
  const walFile = cookiesDb + "-wal";
  const shmFile = cookiesDb + "-shm";
  if (existsSync(walFile)) copyFileSync(walFile, tmpDb + "-wal");
  if (existsSync(shmFile)) copyFileSync(shmFile, tmpDb + "-shm");

  try {
    // Query the encrypted value
    const hostPatterns = [domain, `.${domain}`];
    let encryptedHex: string | null = null;

    for (const host of hostPatterns) {
      const result = execSync(
        `sqlite3 "${tmpDb}" "SELECT hex(encrypted_value) FROM cookies WHERE host_key = '${host}' AND name = '${cookieName}' LIMIT 1"`,
        { encoding: "utf8" },
      ).trim();

      if (result) {
        encryptedHex = result;
        break;
      }
    }

    if (!encryptedHex) {
      return null;
    }

    const password = getEdgeSafeStoragePassword();
    return decryptEdgeCookie(encryptedHex, password);
  } finally {
    // Cleanup
    try { unlinkSync(tmpDb); } catch { /* ignore */ }
    try { unlinkSync(tmpDb + "-wal"); } catch { /* ignore */ }
    try { unlinkSync(tmpDb + "-shm"); } catch { /* ignore */ }
  }
}

// CLI entrypoint
if (process.argv[1]?.includes("extract-edge-cookie")) {
  const domain = process.argv[2];
  const cookieName = process.argv[3];
  const profileDir = process.argv[4] || "Default";

  if (!domain || !cookieName) {
    console.error("Usage: npx tsx scripts/extract-edge-cookie.ts <domain> <cookieName> [profileDir]");
    process.exit(1);
  }

  const value = extractEdgeCookie(domain, cookieName, profileDir);
  if (value) {
    console.log(value);
  } else {
    console.error(`Cookie not found: ${cookieName} @ ${domain}`);
    process.exit(1);
  }
}
