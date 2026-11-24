import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadActor, type Actor } from "./actor";
import { getDb } from "./app-db";

/**
 * Dev-only login: the cookie holds a user id. It's httpOnly but deliberately NOT signed,
 * because the brief tests permission checks, not authentication. Anyone could set it to
 * any user, and that's fine here: every service still checks what that user may touch.
 */
export const SESSION_COOKIE = "dev_user_id";

export async function currentActor(): Promise<Actor | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id)) return null;
  return loadActor(getDb(), id);
}

/** For pages: no user, back to the sign-in page. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/");
  return actor;
}

export function homeFor(actor: Actor): string {
  return actor.role === "contractor" ? "/timesheet" : "/review";
}
