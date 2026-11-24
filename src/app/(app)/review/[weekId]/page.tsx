import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ShieldX } from "lucide-react";
import { loadReview } from "@/components/review/load-review";
import { ReviewScreen } from "@/components/review/review-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { homeFor, requireActor } from "@/server/session";

/** Every page here reads the dev-login cookie, the clock and the database per request, so it renders on
 * the server for each navigation (with the loading skeleton meanwhile) instead of from a prerendered shell. */
export const instant = false;

export default async function ReviewWeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  const actor = await requireActor();
  if (actor.role !== "client") redirect(homeFor(actor));

  const weekId = Number((await params).weekId);
  await connection();
  if (!Number.isSafeInteger(weekId) || weekId <= 0) notFound();

  let data;
  try {
    data = loadReview(actor, weekId);
  } catch (error) {
    if (error instanceof ForbiddenError) return <NotAllowed />;
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return <ReviewScreen {...data} />;
}

function NotAllowed() {
  return (
    <Card className="mx-auto mt-10 max-w-md items-center gap-3 p-8 text-center">
      <ShieldX className="size-7 text-destructive" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Not allowed</h1>
      <p className="text-sm text-muted-foreground">
        This week belongs to another client&apos;s contractor. The server checked who you are and refused it.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/review">Back to your reviews</Link>
      </Button>
    </Card>
  );
}
