"use server";

/**
 * Server Actions are public POST endpoints: anyone can call them with any arguments.
 * So each one is a thin wrapper: who is signed in (from the cookie, never from the form),
 * then a service that checks ownership and the rules itself.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/server/actor";
import { loadActor } from "@/server/actor";
import { getDb } from "@/server/app-db";
import { appNow } from "@/server/clock";
import { createEntry, deleteEntry, updateEntry } from "@/server/entries";
import { isAppError, ValidationError } from "@/server/errors";
import { parseEntryInput, parseId, parseOptionalText, parseText } from "@/server/input";
import { currentActor, homeFor, SESSION_COOKIE } from "@/server/session";
import { approveWeek, rejectWeek, submitWeek } from "@/server/weeks";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(work: (actor: Actor) => void): Promise<ActionResult> {
  const actor = await currentActor();
  if (!actor) return { ok: false, error: "Please sign in again." };
  try {
    work(actor);
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- dev login

export async function signInAction(userId: unknown): Promise<void> {
  const actor = loadActor(getDb(), parseId(userId));
  if (!actor) throw new ValidationError("Unknown user.");
  (await cookies()).set(SESSION_COOKIE, String(actor.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(homeFor(actor));
}

export async function signOutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

// ---------------------------------------------------------------- contractor

export async function createEntryAction(input: unknown): Promise<ActionResult> {
  return run((actor) => {
    createEntry(getDb(), actor, parseEntryInput(input), appNow());
  });
}

export async function updateEntryAction(entryId: unknown, input: unknown): Promise<ActionResult> {
  return run((actor) => updateEntry(getDb(), actor, parseId(entryId), parseEntryInput(input), appNow()));
}

export async function deleteEntryAction(entryId: unknown): Promise<ActionResult> {
  return run((actor) => deleteEntry(getDb(), actor, parseId(entryId)));
}

export async function submitWeekAction(engagementId: unknown, weekStart: unknown): Promise<ActionResult> {
  return run((actor) => {
    submitWeek(getDb(), actor, { engagementId: parseId(engagementId), weekStart: parseText(weekStart) }, appNow());
  });
}

// ---------------------------------------------------------------- client

/** `seenSubmittedAt`: the week's submittedAt as shown on the review page (see approveWeek). */
export async function approveWeekAction(weekId: unknown, seenSubmittedAt?: unknown): Promise<ActionResult> {
  return run((actor) => approveWeek(getDb(), actor, parseId(weekId), appNow(), parseOptionalText(seenSubmittedAt)));
}

export async function rejectWeekAction(
  weekId: unknown,
  comment: unknown,
  seenSubmittedAt?: unknown,
): Promise<ActionResult> {
  return run((actor) =>
    rejectWeek(getDb(), actor, parseId(weekId), parseText(comment), appNow(), parseOptionalText(seenSubmittedAt)),
  );
}
