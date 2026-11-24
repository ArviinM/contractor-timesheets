import { DateTime } from "luxon";
import type { Actor } from "@/server/actor";
import { getDb } from "@/server/app-db";
import { appNow } from "@/server/clock";
import { getInvoice } from "@/server/invoice";
import { getReviewQueue, getReviewWeek, todayFor } from "@/server/queries";

/** Data for the review screen. getReviewWeek throws ForbiddenError for another client's week. */
export function loadReview(actor: Actor, weekId: number | null) {
  const db = getDb();
  const { waiting, decided } = getReviewQueue(db, actor);
  const selected = weekId ?? waiting[0]?.weekId ?? null;
  const detail = selected === null ? null : getReviewWeek(db, actor, selected);

  const today = DateTime.fromISO(todayFor(actor, appNow()));
  const from = today.startOf("month").toFormat("yyyy-MM-dd");
  const to = today.endOf("month").toFormat("yyyy-MM-dd");
  const approvedThisMonthCents = getInvoice(db, actor, from, to).totalCents;

  return {
    clientTimeZone: actor.timeZone,
    waiting,
    decided,
    detail,
    approvedThisMonthCents,
    monthName: today.toFormat("LLLL"),
  };
}
