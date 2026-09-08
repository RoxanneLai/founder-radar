export class IngestionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "IngestionError";
    this.code = code;
  }
}

/** Never persist raw exceptions: SDK errors can contain secrets or source text. */
export function errorCode(error: unknown): string {
  return error instanceof IngestionError ? error.code : "unexpected_error";
}
