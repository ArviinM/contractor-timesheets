/** A rule was broken. The message is safe to show to the user. */
export class ValidationError extends Error {
  readonly kind = "validation";
}

/** The signed-in user doesn't own this record. */
export class ForbiddenError extends Error {
  readonly kind = "forbidden";
  constructor() {
    super("Not allowed");
  }
}

export class NotFoundError extends Error {
  readonly kind = "not_found";
  constructor(what = "Record") {
    super(`${what} not found`);
  }
}

export type AppError = ValidationError | ForbiddenError | NotFoundError;

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  );
}
