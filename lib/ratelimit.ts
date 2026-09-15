import { lt, sql } from "drizzle-orm";
import { db } from "@/db/index";
import { usageLog } from "@/db/schema";

const MINUTE_LIMIT = 30;
const DAY_LIMIT = 300;

// The neon-http driver has no interactive transactions (db.transaction()
// throws "No transactions support in neon-http driver" — see db/queries.ts's
// own comment on this); db.batch() is its one atomic unit, sending each item
// as a separate statement inside one real Postgres transaction via Neon's
// HTTP transaction endpoint. Each statement still gets its own snapshot
// (Postgres default READ COMMITTED), so the advisory lock — acquired in its
// own statement, before the conditional insert's statement runs — actually
// serializes concurrent reservations for the same user: a transaction that
// blocks on the lock re-reads current counts fresh once it acquires it,
// rather than reusing a snapshot taken before the wait.
export async function reserveUsage(
  userId: string,
  route: "transcribe" | "chat" | "speak",
): Promise<boolean> {
  const [, inserted] = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId})::bigint)`),
    db.execute<{ id: string }>(sql`
      insert into usage_log (user_id, route)
      select ${userId}, ${route}
      where (
        select count(*) from usage_log
        where user_id = ${userId} and created_at >= now() - interval '60 seconds'
      ) < ${MINUTE_LIMIT}
      and (
        select count(*) from usage_log
        where user_id = ${userId} and created_at >= now() - interval '24 hours'
      ) < ${DAY_LIMIT}
      returning id
    `),
    db.execute(sql`
      delete from usage_log
      where user_id = ${userId} and created_at < now() - interval '24 hours'
    `),
  ]);

  return inserted.rows.length > 0;
}

export async function cleanupExpiredUsage(): Promise<void> {
  await db.delete(usageLog).where(lt(usageLog.createdAt, sql`now() - interval '24 hours'`));
}
