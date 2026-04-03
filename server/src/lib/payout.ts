import { eq, and, sql } from "drizzle-orm";
import db from "../db";
import { betsTable, usersTable, marketsTable } from "../db/schema";

/**
 * Distribute the full bet pool of a market to winners proportionally.
 * Each winner receives: (their_stake / total_winning_stake) * total_pool
 *
 * Must be called inside the same transaction as the market status update,
 * or called standalone (wraps itself in a transaction).
 */
export async function distributePayout(marketId: number, resolvedOutcomeId: number): Promise<void> {
  const allBets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.marketId, marketId));

  if (allBets.length === 0) return;

  const totalPool = allBets.reduce((sum, b) => sum + b.amount, 0);
  const winningBets = allBets.filter((b) => b.outcomeId === resolvedOutcomeId);
  const winningTotal = winningBets.reduce((sum, b) => sum + b.amount, 0);

  if (winningTotal === 0) return; // nobody bet on the winner – pool stays (edge case)

  // Group winnings by user so we issue one UPDATE per user
  const winningsByUser = new Map<number, number>();
  for (const bet of winningBets) {
    const payout = Number(((bet.amount / winningTotal) * totalPool).toFixed(2));
    winningsByUser.set(bet.userId, (winningsByUser.get(bet.userId) ?? 0) + payout);
  }

  // Apply payouts in a transaction
  await db.transaction(async (tx) => {
    for (const [userId, payout] of winningsByUser) {
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${payout}` })
        .where(eq(usersTable.id, userId));
    }
  });
}

/**
 * Refund all bettors of a market (used when archiving/cancelling).
 * Each bettor gets their original stake back.
 */
export async function refundAllBettors(marketId: number): Promise<void> {
  const allBets = await db
    .select()
    .from(betsTable)
    .where(eq(betsTable.marketId, marketId));

  if (allBets.length === 0) return;

  // Group refunds by user
  const refundsByUser = new Map<number, number>();
  for (const bet of allBets) {
    refundsByUser.set(bet.userId, (refundsByUser.get(bet.userId) ?? 0) + bet.amount);
  }

  await db.transaction(async (tx) => {
    for (const [userId, refund] of refundsByUser) {
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${refund}` })
        .where(eq(usersTable.id, userId));
    }
  });
}
