import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";

const prisma = new PrismaClient();

export async function GET() {
  try {
    await requirePermission("class:read");

    const instructors = await prisma.instructor.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            classes: {
              where: {
                deletedAt: null,
                batch: { deletedAt: null, program: { deletedAt: null } },
              },
            },
            schedules: {
              where: {
                deletedAt: null,
                class: { deletedAt: null, batch: { deletedAt: null, program: { deletedAt: null } } },
                subject: { deletedAt: null },
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return Response.json({ data: instructors });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read instructors", error);
    return Response.json(
      { error: "Unable to load instructors" },
      { status: 500 },
    );
  }
}
