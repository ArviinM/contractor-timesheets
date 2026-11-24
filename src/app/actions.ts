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
import { createEntry, deleteEntry, updateEntry, type EntryInput } from "@/server/entries";
import { isAppError, ValidationError } from "@/server/errors";
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

// Inputs arrive from the network, so their shape is checked too.
function id(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) throw new ValidationError("Bad request.");
  return n;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError("Bad request.");
  return value;
}

function entryInput(value: unknown): EntryInput {
  const v = (value ?? {}) as Record<string, unknown>;
  return { engagementId: id(v.engagementId), start: text(v.start), end: text(v.end), note: text(v.note) };
}

// ---------------------------------------------------------------- dev login

export async function signInAction(userId: unknown): Promise<void> {
  const actor = loadActor(getDb(), id(userId));
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
    createEntry(getDb(), actor, entryInput(input), appNow());
  });
}

export async function updateEntryAction(entryId: unknown, input: unknown): Promise<ActionResult> {
  return run((actor) => updateEntry(getDb(), actor, id(entryId), entryInput(input), appNow()));
}

export async function deleteEntryAction(entryId: unknown): Promise<ActionResult> {
  return run((actor) => deleteEntry(getDb(), actor, id(entryId)));
}

export async function submitWeekAction(engagementId: unknown, weekStart: unknown): Promise<ActionResult> {
  return run((actor) => {
    submitWeek(getDb(), actor, { engagementId: id(engagementId), weekStart: text(weekStart) }, appNow());
  });
}

// ---------------------------------------------------------------- client

export async function approveWeekAction(weekId: unknown): Promise<ActionResult> {
  return run((actor) => approveWeek(getDb(), actor, id(weekId), appNow()));
}

export async function rejectWeekAction(weekId: unknown, comment: unknown): Promise<ActionResult> {
  return run((actor) => rejectWeek(getDb(), actor, id(weekId), text(comment), appNow()));
}
