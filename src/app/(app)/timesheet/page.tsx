import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TimesheetScreen, type WeekView } from "@/components/timesheet/timesheet-screen";
import { getDb } from "@/server/app-db";
import { appNow } from "@/server/clock";
import { getContractorEngagements, getContractorWeek, todayFor } from "@/server/queries";
import { homeFor, requireActor } from "@/server/session";
import { isLocalDate, weekStartOf } from "@/server/time";

/** Every page here reads the dev-login cookie, the clock and the database per request, so it renders on
 * the server for each navigation (with the loading skeleton meanwhile) instead of from a prerendered shell. */
export const instant = false;

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>;
}) {
  const actor = await requireActor();
  if (actor.role !== "contractor") redirect(homeFor(actor));

  const params = await searchParams;
  await connection();
  const now = appNow();
  const today = todayFor(actor, now);
  const weekStart = params.week && isLocalDate(params.week) ? weekStartOf(params.week) : weekStartOf(today);
  const view: WeekView = params.view === "table" || params.view === "timeline" ? params.view : "list";

  const db = getDb();
  const week = getContractorWeek(db, actor, weekStart, now);
  const engagements = getContractorEngagements(db, actor);

  return <TimesheetScreen week={week} engagements={engagements} view={view} nowIso={now.toISOString()} />;
}
