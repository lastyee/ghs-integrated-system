import crypto from "node:crypto";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
  requirePermission,
  UnauthorizedError,
} from "@/lib/authorization";
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  purgeExpiredDocumentFiles,
} from "@/lib/document-retention";
import { z } from "zod";

/**
 * Constant-time comparison to verify CRON_SECRET token.
 */
function verifyCronSecret(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || expectedSecret.trim().length === 0) {
    return false;
  }

  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("x-cron-secret");

  if (!authHeader) {
    return false;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  const expectedBuffer = Buffer.from(expectedSecret.trim());
  const tokenBuffer = Buffer.from(token);

  if (expectedBuffer.length !== tokenBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

/**
 * Evaluates authorization through two strictly separated pathways:
 * 1. Machine-to-machine cron trigger via CRON_SECRET header.
 * 2. Manual trigger by authenticated SUPER_ADMIN user session.
 */
async function authenticatePurgeRequest(
  request: Request
): Promise<{ pathway: "CRON_SECRET" | "SUPER_ADMIN_SESSION"; actorId: string | null }> {
  // Pathway A: Machine/Cron authorization via CRON_SECRET
  if (verifyCronSecret(request)) {
    return { pathway: "CRON_SECRET", actorId: null };
  }

  // Pathway B: Manual invocation via active Super Admin session
  try {
    const user = await requireAuthenticatedUser();
    await requirePermission("document:delete");

    if (user.role !== "SUPER_ADMIN") {
      throw new ForbiddenError(
        "Document retention purge is restricted to SUPER_ADMIN."
      );
    }

    return { pathway: "SUPER_ADMIN_SESSION", actorId: user.id };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    // If not a session and no valid cron secret, reject with 401
    throw new UnauthorizedError(
      "Missing or invalid authorization. Provide a valid CRON_SECRET or Super Admin session."
    );
  }
}

/**
 * Query schema for retention purge requests.
 * Strictly enforces:
 * - retentionDays: must be integer string between 90 and 3650. Values < 90 are rejected with HTTP 400.
 * - dryRun: 'true' | 'false' (optional)
 * - limit: integer string between 1 and 500 (optional)
 * - .strict(): unexpected query parameters are rejected with HTTP 400.
 */
export const purgeQuerySchema = z
  .object({
    retentionDays: z
      .string()
      .optional()
      .refine(
        (val) =>
          val === undefined ||
          (/^\d+$/.test(val) &&
            parseInt(val, 10) >= MIN_RETENTION_DAYS &&
            parseInt(val, 10) <= MAX_RETENTION_DAYS),
        {
          message: `retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days. Values below 90 days are strictly rejected with HTTP 400.`,
        }
      )
      .transform((val) =>
        val !== undefined ? parseInt(val, 10) : DEFAULT_RETENTION_DAYS
      ),
    dryRun: z
      .string()
      .optional()
      .refine((val) => val === undefined || val === "true" || val === "false", {
        message: "dryRun must be 'true' or 'false'.",
      })
      .transform((val) => val === "true"),
    limit: z
      .string()
      .optional()
      .refine(
        (val) =>
          val === undefined ||
          (/^\d+$/.test(val) &&
            parseInt(val, 10) >= 1 &&
            parseInt(val, 10) <= 500),
        {
          message: "limit must be an integer between 1 and 500.",
        }
      )
      .transform((val) => (val !== undefined ? parseInt(val, 10) : 100)),
  })
  .strict();

/**
 * Body schema for retention purge requests.
 * Strictly enforces:
 * - retentionDays: integer between 90 and 3650. Values < 90, decimals, negatives, strings, NaN are rejected with HTTP 400.
 * - dryRun: boolean (optional)
 * - limit: integer between 1 and 500 (optional)
 * - .strict(): unexpected body properties or bypass flags are rejected with HTTP 400.
 */
export const purgeBodySchema = z
  .object({
    retentionDays: z
      .number({ message: "retentionDays must be an integer number." })
      .int("retentionDays must be an integer (no decimals).")
      .min(
        MIN_RETENTION_DAYS,
        `retentionDays must be at least ${MIN_RETENTION_DAYS} days. Values below 90 days are strictly rejected with HTTP 400.`
      )
      .max(
        MAX_RETENTION_DAYS,
        `retentionDays exceeds maximum allowed limit of ${MAX_RETENTION_DAYS} days.`
      )
      .optional(),
    dryRun: z
      .boolean({ message: "dryRun must be a boolean." })
      .optional(),
    limit: z
      .number({ message: "limit must be an integer number." })
      .int("limit must be an integer.")
      .min(1, "limit must be at least 1.")
      .max(500, "limit cannot exceed 500.")
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const auth = await authenticatePurgeRequest(request);

    // 1. Validate query parameters
    const url = new URL(request.url);
    const rawQueryParams = Object.fromEntries(url.searchParams.entries());
    const queryParsed = purgeQuerySchema.safeParse(rawQueryParams);
    if (!queryParsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: queryParsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // 2. Validate request body (if provided)
    let bodyParsedData: z.infer<typeof purgeBodySchema> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return Response.json(
          { message: "Invalid JSON in request body." },
          { status: 400 }
        );
      }
      const bodyParsed = purgeBodySchema.safeParse(rawBody);
      if (!bodyParsed.success) {
        return Response.json(
          {
            message: "Validation failed.",
            errors: bodyParsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }
      bodyParsedData = bodyParsed.data;
    }

    // Effective options: Body overrides query params, with mandatory floor of 90 days enforced by schemas
    const retentionDays =
      bodyParsedData.retentionDays ?? queryParsed.data.retentionDays;
    const dryRun =
      bodyParsedData.dryRun ?? queryParsed.data.dryRun;
    const limit =
      bodyParsedData.limit ?? queryParsed.data.limit;

    // Defense-in-depth: Unconditional server-side policy check
    if (retentionDays < MIN_RETENTION_DAYS) {
      return Response.json(
        {
          message: `retentionDays must be at least ${MIN_RETENTION_DAYS} days. Lowering retention period below 90 days is strictly rejected with HTTP 400.`,
        },
        { status: 400 }
      );
    }

    const summary = await purgeExpiredDocumentFiles({
      retentionDays,
      dryRun,
      limit,
      actorUserId: auth.actorId,
    });

    return Response.json(
      {
        message: dryRun
          ? "Retention dry-run inspection completed."
          : "Document retention purge completed successfully.",
        authorizedVia: auth.pathway,
        summary,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/documents/retention-purge error:", error);
    return Response.json(
      { message: "Internal server error during document retention purge." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await authenticatePurgeRequest(request);

    // Validate query parameters
    const url = new URL(request.url);
    const rawQueryParams = Object.fromEntries(url.searchParams.entries());
    const queryParsed = purgeQuerySchema.safeParse(rawQueryParams);
    if (!queryParsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: queryParsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Defense-in-depth: Unconditional server-side policy check
    if (queryParsed.data.retentionDays < MIN_RETENTION_DAYS) {
      return Response.json(
        {
          message: `retentionDays must be at least ${MIN_RETENTION_DAYS} days. Lowering retention period below 90 days is strictly rejected with HTTP 400.`,
        },
        { status: 400 }
      );
    }

    // GET requests always execute in dry-run mode for safety
    const summary = await purgeExpiredDocumentFiles({
      retentionDays: queryParsed.data.retentionDays,
      dryRun: true,
      limit: queryParsed.data.limit,
      actorUserId: auth.actorId,
    });

    return Response.json(
      {
        message: "Retention dry-run status (read-only).",
        authorizedVia: auth.pathway,
        summary,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/documents/retention-purge error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
