import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";

const prisma = new PrismaClient();
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    await requirePermission("audit:read");

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    const cursor = searchParams.get("cursor") || undefined;

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE_SIZE
    ) {
      return Response.json(
        { error: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.` },
        { status: 400 },
      );
    }

    if (cursor) {
      const cursorExists = await prisma.auditLog.findUnique({
        where: { id: cursor },
        select: { id: true },
      });
      if (!cursorExists) {
        return Response.json({ error: "Invalid audit log cursor." }, { status: 400 });
      }
    }

    const rows = await prisma.auditLog.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(({ user, ...entry }) => ({
      ...entry,
      actor: user,
    }));

    return Response.json({
      data,
      pageInfo: {
        limit,
        hasMore,
        nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read audit logs", error);
    return Response.json({ error: "Unable to load audit logs" }, { status: 500 });
  }
}
