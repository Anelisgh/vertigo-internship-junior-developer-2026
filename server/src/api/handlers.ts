import { eq, and, sql, desc, asc, count } from "drizzle-orm";
import db from "../db";
import {
  usersTable,
  marketsTable,
  marketOutcomesTable,
  betsTable,
} from "../db/schema";
import { hashPassword, verifyPassword, type AuthTokenPayload } from "../lib/auth";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
} from "../lib/validation";
import { distributePayout, refundAllBettors } from "../lib/payout";
import { sseHub } from "../lib/sse-hub";

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/**
 * Enrich a list of markets with aggregated bet stats (single query, no N+1).
 * Returns per-outcome { totalBets, odds } and the overall totalMarketBets.
 */
async function enrichMarkets(
  markets: (typeof marketsTable.$inferSelect & {
    creator: { username: string } | null;
    outcomes: (typeof marketOutcomesTable.$inferSelect)[];
    resolvedOutcome?: { id: number; title: string } | null;
  })[],
) {
  if (markets.length === 0) return [];

  const marketIds = markets.map((m) => m.id);

  // One aggregated query for all outcomes in all requested markets
  const betAggRows = await db
    .select({
      outcomeId: betsTable.outcomeId,
      marketId: betsTable.marketId,
      total: sql<number>`sum(${betsTable.amount})`.as("total"),
      betCount: count(betsTable.id).as("bet_count"),
    })
    .from(betsTable)
    .where(
      sql`${betsTable.marketId} IN (${sql.join(
        marketIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .groupBy(betsTable.outcomeId, betsTable.marketId);

  // Index by outcomeId for O(1) lookup
  const betsByOutcome = new Map<number, { total: number; betCount: number }>();
  const totalByMarket = new Map<number, number>();

  for (const row of betAggRows) {
    betsByOutcome.set(row.outcomeId, { total: row.total, betCount: row.betCount });
    totalByMarket.set(row.marketId, (totalByMarket.get(row.marketId) ?? 0) + row.total);
  }

  const participantsRows = await db
    .select({
      marketId: betsTable.marketId,
      participants: sql<number>`count(distinct ${betsTable.userId})`.as("participants"),
    })
    .from(betsTable)
    .where(
      sql`${betsTable.marketId} IN (${sql.join(
        marketIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .groupBy(betsTable.marketId);

  const participantsByMarket = new Map<number, number>();
  for (const row of participantsRows) {
    participantsByMarket.set(row.marketId, row.participants);
  }

  return markets.map((market) => {
    const totalMarketBets = totalByMarket.get(market.id) ?? 0;

    return {
      id: market.id,
      title: market.title,
      description: market.description,
      status: market.status,
      creator: market.creator?.username ?? null,
      createdAt: market.createdAt,
      resolvedOutcomeId: market.resolvedOutcomeId,
      resolvedOutcome: market.resolvedOutcome ?? null,
      outcomes: market.outcomes.map((outcome) => {
        const agg = betsByOutcome.get(outcome.id);
        const outcomeBets = agg?.total ?? 0;
        const odds =
          totalMarketBets > 0
            ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2))
            : 0;
        return {
          id: outcome.id,
          title: outcome.title,
          odds,
          totalBets: outcomeBets,
        };
      }),
      totalMarketBets,
      participantsCount: participantsByMarket.get(market.id) ?? 0,
    };
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);
  const newUser = await db
    .insert(usersTable)
    .values({ username, email, passwordHash })
    .returning();

  const token = await jwt.sign({ userId: newUser[0]!.id });

  set.status = 201;
  return {
    id: newUser[0]!.id,
    username: newUser[0]!.username,
    email: newUser[0]!.email,
    balance: newUser[0]!.balance,
    isAdmin: newUser[0]!.isAdmin,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance,
    isAdmin: user.isAdmin,
    token,
  };
}

// ─── Markets ─────────────────────────────────────────────────────────────────

export async function handleListMarkets({
  query,
}: {
  query: { status?: string; page?: string; sort?: string; order?: string };
}) {
  const statusFilter = (query.status as "active" | "resolved" | undefined) ?? "active";
  const page = Math.max(1, Number(query.page ?? 1));
  const sort = (query.sort as "createdAt" | "totalBets" | "participants" | undefined) ?? "createdAt";
  const order = (query.order as "asc" | "desc" | undefined) ?? "desc";
  const offset = (page - 1) * PAGE_SIZE;

  const sortFn = order === "asc" ? asc : desc;

  // Order clause
  const orderBy =
    sort === "totalBets"
      ? [sortFn(sql`(SELECT COALESCE(SUM(amount),0) FROM bets WHERE bets.market_id = ${marketsTable.id})`)]
      : sort === "participants"
        ? [sortFn(sql`(SELECT COUNT(DISTINCT user_id) FROM bets WHERE bets.market_id = ${marketsTable.id})`)]
        : [sortFn(marketsTable.createdAt)];

  const [totalRow] = await db
    .select({ total: count().as("total") })
    .from(marketsTable)
    .where(eq(marketsTable.status, statusFilter as "active" | "resolved"));

  const total = totalRow?.total ?? 0;

  const markets = await db.query.marketsTable.findMany({
    where: eq(marketsTable.status, statusFilter as "active" | "resolved"),
    with: {
      creator: { columns: { username: true } },
      outcomes: { orderBy: (outcomes, { asc }) => asc(outcomes.position) },
      resolvedOutcome: { columns: { id: true, title: true } },
    },
    limit: PAGE_SIZE,
    offset,
    orderBy,
  });

  const enriched = await enrichMarkets(markets as any);

  return {
    data: enriched,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    total,
  };
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    with: {
      creator: { columns: { username: true } },
      outcomes: { orderBy: (outcomes, { asc }) => asc(outcomes.position) },
      resolvedOutcome: { columns: { id: true, title: true } },
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  const [enriched] = await enrichMarkets([market as any]);
  return enriched;
}

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description ?? "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db
    .insert(marketsTable)
    .values({ title, description: description ?? null, createdBy: user.id })
    .returning();

  const outcomeIds = await db
    .insert(marketOutcomesTable)
    .values(outcomes.map((t, i) => ({ marketId: market[0].id, title: t, position: i })))
    .returning();

  set.status = 201;
  return {
    id: market[0].id,
    title: market[0].title,
    description: market[0].description,
    status: market[0].status,
    outcomes: outcomeIds,
  };
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;

  const errors = validateBet(amount);
  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  if (amount > user.balance) {
    set.status = 400;
    return { errors: [{ field: "amount", message: "Insufficient balance" }] };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(
      eq(marketOutcomesTable.id, outcomeId),
      eq(marketOutcomesTable.marketId, marketId),
    ),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  // Deduct balance + insert bet atomically
  const bet = await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${amount}` })
      .where(eq(usersTable.id, user.id));

    const [newBet] = await tx
      .insert(betsTable)
      .values({ userId: user.id, marketId, outcomeId, amount: Number(amount) })
      .returning();
    return newBet!;
  });

  // Broadcast updated market to all SSE subscribers (non-blocking)
  handleGetMarket({ params: { id: marketId }, set: { status: 200 } }).then((updatedMarket) => {
    sseHub.broadcast("markets", { type: "market_update", market: updatedMarket });
    sseHub.broadcast(`market:${marketId}`, { type: "market_update", market: updatedMarket });
  });

  set.status = 201;
  return {
    id: bet.id,
    userId: bet.userId,
    marketId: bet.marketId,
    outcomeId: bet.outcomeId,
    amount: bet.amount,
    newBalance: user.balance - amount,
  };
}

// ─── Admin: Resolve & Archive ─────────────────────────────────────────────────

export async function handleResolveMarket({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (!user.isAdmin) {
    set.status = 403;
    return { error: "Forbidden" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is already resolved" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(
      eq(marketOutcomesTable.id, body.outcomeId),
      eq(marketOutcomesTable.marketId, params.id),
    ),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  // Update market + distribute payouts
  await db
    .update(marketsTable)
    .set({ status: "resolved", resolvedOutcomeId: body.outcomeId })
    .where(eq(marketsTable.id, params.id));

  await distributePayout(params.id, body.outcomeId);

  // Notify SSE subscribers
  const updatedMarket = await handleGetMarket({ params: { id: params.id }, set: { status: 200 } });
  sseHub.broadcast("markets", { type: "market_resolved", market: updatedMarket });
  sseHub.broadcast(`market:${params.id}`, { type: "market_resolved", market: updatedMarket });

  return { success: true, message: "Market resolved and payouts distributed" };
}

export async function handleArchiveMarket({
  params,
  set,
  user,
}: {
  params: { id: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (!user.isAdmin) {
    set.status = 403;
    return { error: "Forbidden" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is already resolved" };
  }

  // Refund all bettors + close market
  await refundAllBettors(params.id);
  await db
    .update(marketsTable)
    .set({ status: "resolved" })
    .where(eq(marketsTable.id, params.id));

  return { success: true, message: "Market archived and bettors refunded" };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function handleGetMe({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance,
    isAdmin: user.isAdmin,
    hasApiKey: user.apiKey !== null,
  };
}

export async function handleGetUserBets({
  query,
  user,
}: {
  query: { page?: string; type?: string };
  user: typeof usersTable.$inferSelect;
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const type = (query.type as "active" | "resolved" | "all" | undefined) ?? "all";
  const offset = (page - 1) * PAGE_SIZE;

  const bets = await db
    .select({
      id: betsTable.id,
      amount: betsTable.amount,
      createdAt: betsTable.createdAt,
      outcomeId: betsTable.outcomeId,
      outcomeTitle: marketOutcomesTable.title,
      marketId: marketsTable.id,
      marketTitle: marketsTable.title,
      marketStatus: marketsTable.status,
      resolvedOutcomeId: marketsTable.resolvedOutcomeId,
    })
    .from(betsTable)
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(
      type === "active"
        ? and(eq(betsTable.userId, user.id), eq(marketsTable.status, "active"))
        : type === "resolved"
          ? and(eq(betsTable.userId, user.id), eq(marketsTable.status, "resolved"))
          : eq(betsTable.userId, user.id),
    )
    .orderBy(desc(betsTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .where(
      type === "active"
        ? and(eq(betsTable.userId, user.id), eq(marketsTable.status, "active"))
        : type === "resolved"
          ? and(eq(betsTable.userId, user.id), eq(marketsTable.status, "resolved"))
          : eq(betsTable.userId, user.id),
    );

  const total = totalRow?.total ?? 0;

  const enrichedBets = await Promise.all(
    bets.map(async (bet) => {
      let odds: number | null = null;
      let won: boolean | null = null;
      let payout: number | null = null;

      if (bet.marketStatus === "active") {
        // Calculate current odds for this outcome
        const [agg] = await db
          .select({
            outcomeTotal: sql<number>`sum(case when outcome_id = ${bet.outcomeId} then amount else 0 end)`,
            marketTotal: sql<number>`sum(amount)`,
          })
          .from(betsTable)
          .where(eq(betsTable.marketId, bet.marketId));

        if (agg && agg.marketTotal > 0) {
          odds = Number(((agg.outcomeTotal / agg.marketTotal) * 100).toFixed(2));
        }
      }

      if (bet.marketStatus === "resolved" && bet.resolvedOutcomeId !== null) {
        won = bet.outcomeId === bet.resolvedOutcomeId;
        if (won) {
          // Approximate payout (actual was distributed at resolution time)
          const [agg] = await db
            .select({
              winningTotal: sql<number>`sum(case when outcome_id = ${bet.resolvedOutcomeId} then amount else 0 end)`,
              marketTotal: sql<number>`sum(amount)`,
            })
            .from(betsTable)
            .where(eq(betsTable.marketId, bet.marketId));

          if (agg && agg.winningTotal > 0) {
            payout = Number(((bet.amount / agg.winningTotal) * agg.marketTotal).toFixed(2));
          }
        }
      }

      return {
        id: bet.id,
        amount: bet.amount,
        createdAt: bet.createdAt,
        outcomeId: bet.outcomeId,
        outcomeTitle: bet.outcomeTitle,
        marketId: bet.marketId,
        marketTitle: bet.marketTitle,
        marketStatus: bet.marketStatus,
        resolvedOutcomeId: bet.resolvedOutcomeId,
        odds,
        won,
        payout,
      };
    }),
  );

  return {
    data: enrichedBets,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    total,
  };
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function handleGetLeaderboard({
  query,
}: {
  query: { page?: string };
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  // Rank by total balance descending (excluding admins)
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      balance: usersTable.balance,
    })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, false))
    .orderBy(desc(usersTable.balance))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, false));
  const total = totalRow?.total ?? 0;

  const data = rows.map((row, i) => ({
    rank: offset + i + 1,
    id: row.id,
    username: row.username,
    balance: row.balance,
  }));

  return {
    data,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
    total,
  };
}

// ─── API Keys (Bonus) ────────────────────────────────────────────────────────

export async function handleGenerateApiKey({
  set,
  user,
}: {
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const rawKey = `pm_${crypto.randomUUID().replace(/-/g, "")}`;

  await db
    .update(usersTable)
    .set({ apiKey: rawKey })
    .where(eq(usersTable.id, user.id));

  set.status = 201;
  return { apiKey: rawKey };
}

export async function handleRevokeApiKey({
  set,
  user,
}: {
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  await db
    .update(usersTable)
    .set({ apiKey: null })
    .where(eq(usersTable.id, user.id));

  set.status = 200;
  return { success: true };
}
