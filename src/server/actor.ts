import { ForbiddenError, NotFoundError } from "./errors";
import type { DB } from "./db";

export type Role = "contractor" | "client";

/** The signed-in user, loaded on the server from the dev-login cookie. */
export type Actor = {
  id: number;
  name: string;
  role: Role;
  timeZone: string;
};

export function loadActor(db: DB, userId: number): Actor | null {
  const row = db
    .prepare("SELECT id, name, role, time_zone AS timeZone FROM users WHERE id = ?")
    .get(userId) as Actor | undefined;
  return row ?? null;
}

export function requireRole(actor: Actor, role: Role): void {
  if (actor.role !== role) throw new ForbiddenError();
}

export type Engagement = {
  id: number;
  contractorId: number;
  clientId: number;
  hourlyRateCents: number;
};

export function getEngagement(db: DB, engagementId: number): Engagement {
  const row = db
    .prepare(
      `SELECT id, contractor_id AS contractorId, client_id AS clientId,
              hourly_rate_cents AS hourlyRateCents
         FROM engagements WHERE id = ?`,
    )
    .get(engagementId) as Engagement | undefined;
  if (!row) throw new NotFoundError("Client");
  return row;
}

/** The engagement must belong to this contractor. */
export function requireContractorEngagement(db: DB, actor: Actor, engagementId: number): Engagement {
  requireRole(actor, "contractor");
  const engagement = getEngagement(db, engagementId);
  if (engagement.contractorId !== actor.id) throw new ForbiddenError();
  return engagement;
}
