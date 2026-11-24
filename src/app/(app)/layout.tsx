import { Suspense } from "react";
import { connection } from "next/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AppShellSkeleton } from "@/components/skeletons";
import { TopBar } from "@/components/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getDb } from "@/server/app-db";
import { appNow } from "@/server/clock";
import { countWaiting, getRecentWeeks, todayFor } from "@/server/queries";
import { requireActor } from "@/server/session";
import { weekStartOf } from "@/server/time";

/** Every page here reads the dev-login cookie, the clock and the database per request, so it renders on
 * the server for each navigation (with the loading skeleton meanwhile) instead of from a prerendered shell. */
export const instant = false;

/** Everything behind the dev login is per request, so it streams in behind one Suspense boundary. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

/** No user in the cookie: back to the sign-in page. */
async function SignedInShell({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  await connection(); // the clock and the database are read per request
  const db = getDb();
  const recentWeeks = actor.role === "contractor" ? getRecentWeeks(db, actor) : [];
  const waiting = countWaiting(db, actor);
  const currentWeek = weekStartOf(todayFor(actor, appNow()));

  return (
    <SidebarProvider>
      {/* No inner Suspense here: the sidebar must hydrate together with its provider, which
          switches to the phone layout right after hydration. The layout's boundary covers it. */}
      <AppSidebar
        user={{ name: actor.name, role: actor.role, timeZone: actor.timeZone }}
        currentWeek={currentWeek}
        recentWeeks={recentWeeks}
        waiting={waiting}
      />
      <SidebarInset>
        <TopBar role={actor.role} userId={actor.id} />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
