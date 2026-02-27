import { requireAdminApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { members, memberIdentities, usageRecords } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import crypto from "crypto";

/**
 * POST /api/admin/members/reconcile
 *
 * Scans usage_records for unlinked vendor identities and:
 * 1. Creates new members from Cursor emails (most complete data source)
 * 2. Matches Copilot GitHub usernames to members by name heuristics
 * 3. Creates member_identities for all matched vendors
 * 4. Links usage_records to their member
 */
export async function POST() {
  const result = await requireAdminApi();
  if (result.error) return result.error;
  const { session } = result;
  const tenantId = session.user.tenantId;

  // 1. Get all unlinked usage records
  const unlinked = await db
    .select()
    .from(usageRecords)
    .where(
      and(eq(usageRecords.tenantId, tenantId), isNull(usageRecords.memberId))
    );

  // 2. Get existing members and identities
  const existingMembers = await db
    .select()
    .from(members)
    .where(eq(members.tenantId, tenantId));

  const existingIdentities = await db
    .select()
    .from(memberIdentities);

  // Build lookup maps
  const memberByEmail = new Map<string, string>(); // email -> memberId
  const memberByName = new Map<string, string>(); // lowercase name -> memberId
  const identitySet = new Set<string>(); // "vendor:vendorEmail" or "vendor:vendorUsername"

  for (const m of existingMembers) {
    memberByEmail.set(m.email.toLowerCase(), m.id);
    memberByName.set(m.name.toLowerCase(), m.id);
  }

  for (const i of existingIdentities) {
    if (i.vendorEmail) identitySet.add(`${i.vendor}:${i.vendorEmail.toLowerCase()}`);
    if (i.vendorUsername) identitySet.add(`${i.vendor}:${i.vendorUsername.toLowerCase()}`);
  }

  // 3. Phase 1: Create members from Cursor records (they have full email + name)
  const cursorRecords = unlinked.filter((r) => r.vendor === "cursor" && r.vendorEmail);
  let membersCreated = 0;

  for (const r of cursorRecords) {
    const email = r.vendorEmail!.toLowerCase();
    if (memberByEmail.has(email)) continue;

    // Derive name from email or use vendorUsername
    const name =
      r.vendorUsername ||
      email
        .split("@")[0]
        .split(".")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");

    const memberId = crypto.randomUUID();
    await db.insert(members).values({
      id: memberId,
      tenantId,
      name,
      email,
    });

    memberByEmail.set(email, memberId);
    memberByName.set(name.toLowerCase(), memberId);
    membersCreated++;

    // Create cursor identity
    if (!identitySet.has(`cursor:${email}`)) {
      await db.insert(memberIdentities).values({
        id: crypto.randomUUID(),
        memberId,
        vendor: "cursor",
        vendorEmail: r.vendorEmail,
        vendorUsername: r.vendorUsername,
      });
      identitySet.add(`cursor:${email}`);
    }
  }

  // 4. Phase 2: Match Copilot GitHub usernames to existing members
  const copilotRecords = unlinked.filter((r) => r.vendor === "copilot" && r.vendorUsername);
  let identitiesMatched = 0;

  // Build a GitHub username -> Cursor member matching function
  // Strategy: normalize the GitHub username and try to match against member names/emails
  for (const r of copilotRecords) {
    const ghUsername = r.vendorUsername!;
    const ghLower = ghUsername.toLowerCase();

    if (identitySet.has(`copilot:${ghLower}`)) continue;

    let matchedMemberId: string | null = null;

    // Strategy 1: Direct last-name or full-name match against member emails
    for (const [email, memberId] of memberByEmail) {
      const localPart = email.split("@")[0]; // e.g., "adam.desilvester"
      const parts = localPart.split("."); // ["adam", "desilvester"]

      // Try matching GitHub username contains parts of the email
      const ghNormalized = ghLower.replace(/[-_]/g, "");
      const firstName = parts[0] || "";
      const lastName = parts[parts.length - 1] || "";

      // Full name match: "adamdesilvester" contains "adam" + "desilvester"
      if (
        ghNormalized.includes(firstName) &&
        ghNormalized.includes(lastName) &&
        firstName.length >= 3
      ) {
        matchedMemberId = memberId;
        break;
      }

      // Last name match if distinctive enough (>= 5 chars)
      if (lastName.length >= 5 && ghNormalized.includes(lastName)) {
        matchedMemberId = memberId;
        break;
      }

      // First + last initial match: "kennethR-aw" -> "kenneth" + "r" matches "kenneth.ring"
      if (
        firstName.length >= 4 &&
        ghNormalized.startsWith(firstName) &&
        lastName.length > 0 &&
        ghNormalized.includes(lastName[0])
      ) {
        // Extra validation: check if the rest of the username is plausible
        const afterFirst = ghNormalized.slice(firstName.length);
        if (afterFirst.startsWith(lastName[0]) || afterFirst.length <= 5) {
          matchedMemberId = memberId;
          break;
        }
      }
    }

    // Strategy 2: Try matching against member names
    if (!matchedMemberId) {
      for (const [name, memberId] of memberByName) {
        const nameParts = name.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts[nameParts.length - 1] || "";
        const ghNormalized = ghLower.replace(/[-_]/g, "");

        if (
          firstName.length >= 3 &&
          lastName.length >= 3 &&
          ghNormalized.includes(firstName) &&
          ghNormalized.includes(lastName)
        ) {
          matchedMemberId = memberId;
          break;
        }
      }
    }

    if (matchedMemberId) {
      await db.insert(memberIdentities).values({
        id: crypto.randomUUID(),
        memberId: matchedMemberId,
        vendor: "copilot",
        vendorUsername: ghUsername,
        vendorEmail: r.vendorEmail,
      });
      identitySet.add(`copilot:${ghLower}`);
      identitiesMatched++;
    }
  }

  // 5. Phase 3: Create members for any remaining unmatched Copilot users
  let copilotOnlyMembers = 0;
  for (const r of copilotRecords) {
    const ghUsername = r.vendorUsername!;
    const ghLower = ghUsername.toLowerCase();
    if (identitySet.has(`copilot:${ghLower}`)) continue;

    // Create a member from the GitHub username
    // Try to make a readable name from the username
    const name = ghUsername
      .replace(/[-_]/g, " ")
      .replace(/\b(aw|awi|assetworks)\b/gi, "")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ") || ghUsername;

    const memberId = crypto.randomUUID();
    await db.insert(members).values({
      id: memberId,
      tenantId,
      name,
      email: `${ghLower}@github.com`, // placeholder email
    });

    await db.insert(memberIdentities).values({
      id: crypto.randomUUID(),
      memberId,
      vendor: "copilot",
      vendorUsername: ghUsername,
      vendorEmail: null,
    });

    identitySet.add(`copilot:${ghLower}`);
    memberByName.set(name.toLowerCase(), memberId);
    copilotOnlyMembers++;
  }

  // 6. Phase 4: Link usage_records to members via identities
  const allIdentities = await db
    .select()
    .from(memberIdentities);

  const emailToMember = new Map<string, string>();
  const usernameVendorToMember = new Map<string, string>();

  for (const i of allIdentities) {
    if (i.vendorEmail) {
      emailToMember.set(`${i.vendor}:${i.vendorEmail.toLowerCase()}`, i.memberId);
    }
    if (i.vendorUsername) {
      usernameVendorToMember.set(`${i.vendor}:${i.vendorUsername.toLowerCase()}`, i.memberId);
    }
  }

  let recordsLinked = 0;
  const allUnlinked = await db
    .select()
    .from(usageRecords)
    .where(
      and(eq(usageRecords.tenantId, tenantId), isNull(usageRecords.memberId))
    );

  for (const r of allUnlinked) {
    let memberId: string | null = null;

    if (r.vendorEmail) {
      memberId = emailToMember.get(`${r.vendor}:${r.vendorEmail.toLowerCase()}`) || null;
    }
    if (!memberId && r.vendorUsername) {
      memberId = usernameVendorToMember.get(`${r.vendor}:${r.vendorUsername.toLowerCase()}`) || null;
    }

    if (memberId) {
      await db
        .update(usageRecords)
        .set({ memberId })
        .where(eq(usageRecords.id, r.id));
      recordsLinked++;
    }
  }

  return Response.json({
    data: {
      membersCreated,
      identitiesMatched,
      copilotOnlyMembers,
      recordsLinked,
      totalMembers: existingMembers.length + membersCreated + copilotOnlyMembers,
    },
  });
}
