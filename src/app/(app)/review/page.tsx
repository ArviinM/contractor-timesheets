import { redirect } from "next/navigation";
import { connection } from "next/server";
import { loadReview } from "@/components/review/load-review";
import { ReviewScreen } from "@/components/review/review-screen";
import { homeFor, requireActor } from "@/server/session";

/** Every page here reads the dev-login cookie, the clock and the database per request, so it renders on
 * the server for each navigation (with the loading skeleton meanwhile) instead of from a prerendered shell. */
export const instant = false;

export default async function ReviewPage() {
  const actor = await requireActor();
  if (actor.role !== "client") redirect(homeFor(actor));
  await connection();
  return <ReviewScreen {...loadReview(actor, null)} />;
}
