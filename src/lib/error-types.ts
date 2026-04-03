export type HkErrorKind =
  | "NotFound"
  | "Network"
  | "PermissionDenied"
  | "ConfigCorrupted"
  | "Conflict"
  | "PathNotAllowed"
  | "Database"
  | "CommandFailed"
  | "Internal";

export interface HkError {
  kind: HkErrorKind;
  message: string;
}

/**
 * Parse an unknown error into a structured HkError.
 * Handles both legacy string errors and new structured {kind, message} errors.
 */
export function parseError(error: unknown): HkError {
  // New structured format from Tauri
  if (error && typeof error === "object" && "kind" in error && "message" in error) {
    return error as HkError;
  }
  // Legacy string format
  if (typeof error === "string") {
    if (error.includes("not found") || error.includes("Not found")) {
      return { kind: "NotFound", message: error };
    }
    if (error.includes("Network") || error.includes("timeout") || error.includes("Failed to reach")) {
      return { kind: "Network", message: error };
    }
    if (error.includes("Permission denied")) {
      return { kind: "PermissionDenied", message: error };
    }
    if (error.includes("not within") || error.includes("Path not allowed")) {
      return { kind: "PathNotAllowed", message: error };
    }
    if (error.includes("Database") || error.includes("database")) {
      return { kind: "Database", message: error };
    }
    return { kind: "Internal", message: error };
  }
  return { kind: "Internal", message: String(error) };
}

/** Whether the error is likely transient and worth retrying */
export function isRetryable(error: HkError): boolean {
  return error.kind === "Network";
}
