import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/authorization";

const sensitiveKeyPattern =
  /password|token|secret|session|database[_-]?url|document(binary|content)?/i;

function sanitizeValue(value: unknown): Prisma.JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item): item is Prisma.JsonValue => item !== undefined);
  }

  if (typeof value === "object") {
    const sanitized: Record<string, Prisma.JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        continue;
      }

      const safeValue = sanitizeValue(nestedValue);
      if (safeValue !== undefined) {
        sanitized[key] = safeValue;
      }
    }

    return sanitized;
  }

  return undefined;
}

export type AuditLogInput = {
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, unknown>;
};

export async function createAuditLog(
  transaction: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  input: AuditLogInput,
) {
  const changes = sanitizeValue(input.changes);

  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new Error("Audit changes must be a JSON object");
  }

  return transaction.auditLog.create({
    data: {
      userId: actor.id,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      changes,
    },
  });
}
