import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  companyUsers,
  companies,
  crews,
  customers,
  db,
  pool,
  ticketTypeStatuses,
  ticketTypes,
  tickets,
  users,
} from "@workspace/db";

const RANDY_EMAIL = "randy@highplainsprop.com";
const CREW_NAME = "Randy's Crew";
const CUSTOMER_TAG = "randy-demo-seed";

// Canonical High Plains company resolution — mirrors seed-mobile-test-user.ts
// so both seeds anchor to the same company contract: look up the well-known
// admin (Mike) and use his default_company_id, with a slug/name fallback if
// that admin row is gone or has no defaultCompanyId.
const ADMIN_LOOKUP_EMAIL = "mike@highplainsprop.com";
const COMPANY_SLUG_CANDIDATES = ["high-plains-property-maintenance", "high-plains"];
const COMPANY_NAME_CANDIDATES = ["High Plains Property Maintenance", "High Plains"];

interface SeedCustomer {
  customerNumber: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

const SEED_CUSTOMERS: SeedCustomer[] = [
  { customerNumber: "RANDY-001", name: "Sunset Ridge HOA",         street: "3120 Sunset Ridge Rd", city: "Loveland",     state: "CO", zip: "80538" },
  { customerNumber: "RANDY-002", name: "Maple Grove Townhomes",    street: "742 Maple Grove Ln",   city: "Loveland",     state: "CO", zip: "80537" },
  { customerNumber: "RANDY-003", name: "Boulder Creek Plaza",      street: "1199 Boulder Creek Dr", city: "Fort Collins", state: "CO", zip: "80525" },
  { customerNumber: "RANDY-004", name: "Stonebridge Apartments",   street: "615 Stonebridge Ave",  city: "Fort Collins", state: "CO", zip: "80526" },
  { customerNumber: "RANDY-005", name: "Highland Park Offices",    street: "2480 Highland Pkwy",   city: "Greeley",      state: "CO", zip: "80634" },
  { customerNumber: "RANDY-006", name: "Willow Bend Community",    street: "905 Willow Bend Ct",   city: "Windsor",      state: "CO", zip: "80550" },
];

interface SeedTicket {
  customerIdx: number;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  routeOrder: number | null;
  mobileStatus: "not_started" | "in_progress" | "complete" | "skipped" | "flagged";
  hourOffset: number;
  dayOffset: number;
}

const SEED_TICKETS: SeedTicket[] = [
  { customerIdx: 0, title: "Randy demo: Mow front common area",        priority: "normal", routeOrder: 1,    mobileStatus: "in_progress", hourOffset: 8,  dayOffset: 0 },
  { customerIdx: 1, title: "Randy demo: Weekly grounds inspection",    priority: "high",   routeOrder: 2,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: 0 },
  { customerIdx: 2, title: "Randy demo: Edge sidewalks & blow off",    priority: "normal", routeOrder: 3,    mobileStatus: "not_started", hourOffset: 10, dayOffset: 0 },
  { customerIdx: 3, title: "Randy demo: Spot-spray weeds in beds",     priority: "low",    routeOrder: 4,    mobileStatus: "flagged",     hourOffset: 11, dayOffset: 0 },
  { customerIdx: 4, title: "Randy demo: Trim shrubs near entrance",    priority: "normal", routeOrder: 5,    mobileStatus: "not_started", hourOffset: 13, dayOffset: 0 },
  { customerIdx: 5, title: "Randy demo: Walk property w/ HOA board",   priority: "urgent", routeOrder: null, mobileStatus: "not_started", hourOffset: 14, dayOffset: 0 },
  { customerIdx: 0, title: "Randy demo: Early completed visit",        priority: "normal", routeOrder: 0,    mobileStatus: "complete",    hourOffset: 7,  dayOffset: 0 },
  { customerIdx: 1, title: "Randy demo: Yesterday's mowing pass",      priority: "normal", routeOrder: 1,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: -1 },
  { customerIdx: 2, title: "Randy demo: Tomorrow follow-up visit",     priority: "normal", routeOrder: 1,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: 1 },
];

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const isProdEnv =
    process.env["REPLIT_DEPLOYMENT"] === "1" ||
    process.env["NODE_ENV"] === "production";
  if (isProdEnv && process.env["ALLOW_PROD_SEED"] !== "1") {
    throw new Error(
      "Refusing to run seed script in a production-like environment " +
        "(REPLIT_DEPLOYMENT=1 or NODE_ENV=production). " +
        "Set ALLOW_PROD_SEED=1 to override (you almost certainly do not want to).",
    );
  }

  const summary = await db.transaction(async (tx) => {
    // Look up Randy — never create him. His account is provisioned
    // separately (real user, real password) and shouldn't be re-provisioned
    // by a demo seed.
    const [randy] = await tx.select().from(users).where(eq(users.email, RANDY_EMAIL));
    if (!randy) {
      throw new Error(
        `User "${RANDY_EMAIL}" not found. This seed expects Randy's user account ` +
          `to already exist (it is provisioned separately). Aborting.`,
      );
    }

    // Canonical High Plains company resolution (mirrors seed-mobile-test-user):
    // primary path is the well-known admin (Mike) → default_company_id;
    // fallback is a slug/name lookup against the companies table. Either path
    // requires a unique match.
    let companyId: string | null = null;
    let companyName: string | null = null;
    let resolvedVia = "";

    const [admin] = await tx
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_LOOKUP_EMAIL));
    if (admin?.defaultCompanyId) {
      const [adminCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, admin.defaultCompanyId));
      if (adminCompany) {
        companyId = adminCompany.id;
        companyName = adminCompany.name;
        resolvedVia = `${ADMIN_LOOKUP_EMAIL} → default_company_id`;
      }
    }

    if (!companyId) {
      const matches = await tx
        .select()
        .from(companies)
        .where(
          or(
            inArray(companies.slug, COMPANY_SLUG_CANDIDATES),
            inArray(companies.name, COMPANY_NAME_CANDIDATES),
          ),
        );
      if (matches.length === 0) {
        throw new Error(
          `Could not find High Plains company: admin "${ADMIN_LOOKUP_EMAIL}" was missing or had no defaultCompanyId, ` +
            `and no companies matched slug ${JSON.stringify(COMPANY_SLUG_CANDIDATES)} ` +
            `or name ${JSON.stringify(COMPANY_NAME_CANDIDATES)}.`,
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous fallback company match (${matches.length} rows): ${matches
            .map((c) => `${c.name} [${c.slug}]`)
            .join(", ")}. Refusing to seed.`,
        );
      }
      companyId = matches[0].id;
      companyName = matches[0].name;
      resolvedVia = `slug/name fallback (${matches[0].slug})`;
    }
    // eslint-disable-next-line no-console
    console.log(`Resolved company "${companyName}" (${companyId}) via ${resolvedVia}.`);

    const [todoType] = await tx
      .select()
      .from(ticketTypes)
      .where(and(eq(ticketTypes.companyId, companyId), eq(ticketTypes.name, "To-Do")));
    if (!todoType) {
      throw new Error(`No "To-Do" ticket type found for company ${companyId}`);
    }
    const [openStatus] = await tx
      .select()
      .from(ticketTypeStatuses)
      .where(eq(ticketTypeStatuses.ticketTypeId, todoType.id))
      .orderBy(asc(ticketTypeStatuses.displayOrder));
    if (!openStatus) {
      throw new Error(`Ticket type "${todoType.name}" has no statuses`);
    }

    // Promote Randy's company membership to crew_supervisor / active only if
    // it isn't already (don't churn the row otherwise).
    const [membership] = await tx
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, randy.id), eq(companyUsers.companyId, companyId)));
    if (!membership) {
      await tx.insert(companyUsers).values({
        userId: randy.id,
        companyId,
        role: "crew_supervisor",
        status: "active",
        tags: [],
        joinedAt: new Date(),
      });
    } else if (membership.role !== "crew_supervisor" || membership.status !== "active") {
      await tx
        .update(companyUsers)
        .set({ role: "crew_supervisor", status: "active" })
        .where(eq(companyUsers.id, membership.id));
    }

    let crew = (
      await tx
        .select()
        .from(crews)
        .where(and(eq(crews.companyId, companyId), eq(crews.name, CREW_NAME)))
    )[0];
    if (!crew) {
      [crew] = await tx
        .insert(crews)
        .values({
          companyId,
          name: CREW_NAME,
          supervisorUserId: randy.id,
          isActive: true,
        })
        .returning();
    } else {
      [crew] = await tx
        .update(crews)
        .set({ supervisorUserId: randy.id, isActive: true })
        .where(eq(crews.id, crew.id))
        .returning();
    }

    const customerIds: string[] = [];
    for (const seed of SEED_CUSTOMERS) {
      const [existing] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.companyId, companyId),
            eq(customers.customerNumber, seed.customerNumber),
          ),
        );
      if (existing) {
        const [updated] = await tx
          .update(customers)
          .set({
            name: seed.name,
            street: seed.street,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
            tags: [CUSTOMER_TAG],
            status: "active",
            active: "true",
          })
          .where(eq(customers.id, existing.id))
          .returning();
        customerIds.push(updated.id);
      } else {
        const [inserted] = await tx
          .insert(customers)
          .values({
            companyId,
            name: seed.name,
            customerNumber: seed.customerNumber,
            street: seed.street,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
            status: "active",
            active: "true",
            tags: [CUSTOMER_TAG],
            customerType: "commercial",
          })
          .returning();
        customerIds.push(inserted.id);
      }
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    // Refresh seeded tickets only (matched by deterministic title list scoped
    // to Randy's crew) so re-running keeps counts stable without disturbing
    // ad-hoc demo tickets a developer may have manually attached.
    await tx
      .delete(tickets)
      .where(
        and(
          eq(tickets.companyId, companyId),
          eq(tickets.crewId, crew.id),
          inArray(tickets.title, SEED_TICKETS.map((t) => t.title)),
        ),
      );

    let insertedCount = 0;
    for (const seed of SEED_TICKETS) {
      const dueDate = new Date(dayStart);
      dueDate.setDate(dueDate.getDate() + seed.dayOffset);
      dueDate.setHours(seed.hourOffset, 0, 0, 0);

      await tx.insert(tickets).values({
        companyId,
        customerId: customerIds[seed.customerIdx],
        ticketTypeId: todoType.id,
        currentStatusId: openStatus.id,
        title: seed.title,
        description: "Seeded by seed-randy.ts for the mobile field-crew demo.",
        priority: seed.priority,
        workType: "contract",
        billingBehavior: "no_invoice",
        crewId: crew.id,
        routeOrder: seed.routeOrder,
        mobileStatus: seed.mobileStatus,
        dueDate,
        createdById: randy.id,
        ...(seed.mobileStatus === "in_progress"
          ? { startedAt: new Date(dueDate.getTime() - 10 * 60 * 1000) }
          : {}),
        ...(seed.mobileStatus === "complete"
          ? {
              startedAt: new Date(dueDate.getTime() - 30 * 60 * 1000),
              completedAt: new Date(dueDate.getTime() + 5 * 60 * 1000),
            }
          : {}),
      });
      insertedCount += 1;
    }

    const todayCount = SEED_TICKETS.filter(
      (t) => t.dayOffset === 0 && t.mobileStatus !== "complete",
    ).length;

    return {
      companyId,
      companyName,
      crewId: crew.id,
      insertedCount,
      todayCount,
    };
  });

  const publishedDomain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const devDomain = process.env["REPLIT_DEV_DOMAIN"]?.trim();
  const baseUrl = publishedDomain
    ? `https://${publishedDomain}`
    : devDomain
      ? `https://${devDomain}`
      : "http://localhost:80";
  const loginUrl = `${baseUrl}/api/m/auth/login`;
  const expoDomain = process.env["REPLIT_EXPO_DEV_DOMAIN"]?.trim();
  const mobileAppUrl = expoDomain ? `https://${expoDomain}` : null;

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "Randy seeded successfully as mobile crew supervisor.",
      "─────────────────────────────────────────────",
      `Email:        ${RANDY_EMAIL}`,
      `Password:     (Randy's existing password — not changed)`,
      `Role:         crew_supervisor`,
      `Company:      ${summary.companyName} (${summary.companyId})`,
      `Crew:         ${CREW_NAME} (${summary.crewId})`,
      `Customers:    ${SEED_CUSTOMERS.length}`,
      `Tickets seeded total: ${summary.insertedCount}`,
      `Today tab will show: ${summary.todayCount} stops`,
      "",
      "How to sign in on the mobile app:",
      mobileAppUrl
        ? `  1. Open the High Plains Mobile app: ${mobileAppUrl}`
        : "  1. Open the High Plains Mobile app (artifacts/highplains-mobile preview).",
      `  2. Enter email "${RANDY_EMAIL}" and Randy's password on the login screen.`,
      "  3. The Today tab should populate with the seeded stops.",
      "",
      "Equivalent direct API call:",
      `  curl -X POST ${loginUrl} \\`,
      `    -H "Content-Type: application/json" \\`,
      `    -d '{"username":"${RANDY_EMAIL}","password":"<randy-password>"}'`,
      "",
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
