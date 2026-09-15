import { NextResponse } from "next/server";
import { cleanupExpiredUsage } from "@/lib/ratelimit";

// Vercel Cron calls this on the schedule in vercel.json, sending
// `Authorization: Bearer ${CRON_SECRET}` automatically — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// This is the only route in the app not gated by requireUser(): it has no
// end-user session, just this shared secret.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await cleanupExpiredUsage();
  return NextResponse.json({ ok: true });
}
