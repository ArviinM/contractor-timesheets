import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";
import { signInAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { UserAvatar } from "@/components/user-avatar";
import { SignInListSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { getDb } from "@/server/app-db";
import { listUsers, type UserCard } from "@/server/queries";

export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg gap-6 p-6">
        <div className="flex flex-col gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Timesheets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This sample uses a dev login, so pick who you want to be. Real accounts and passwords are
              out of scope.
            </p>
          </div>
        </div>
        <Suspense fallback={<SignInListSkeleton />}>
          <UserList />
        </Suspense>
        <p className="text-xs text-muted-foreground">
          Signing in sets a cookie. The server reads who you are from that cookie on every request,
          never from a form.
        </p>
      </Card>
    </main>
  );
}

/** Read per request: the hints (rejected weeks, waiting counts) change as people use the app. */
async function UserList() {
  await connection();
  const users = listUsers(getDb());
  return (
    <>
      <UserGroup title="Contractors" users={users.filter((u) => u.role === "contractor")} />
      <UserGroup title="Clients" users={users.filter((u) => u.role === "client")} />
    </>
  );
}

function UserGroup({ title, users }: { title: string; users: UserCard[] }) {
  return (
    <section aria-labelledby={`group-${title}`} className="flex flex-col gap-2">
      <h2 id={`group-${title}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="divide-y rounded-lg border">
        {users.map((u) => (
          <li key={u.id}>
            <form action={signInAction.bind(null, u.id)}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                aria-label={`Sign in as ${u.name}`}
              >
                <UserAvatar name={u.name} role={u.role} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.timeZone}</span>
                </span>
                <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">{u.hint}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
