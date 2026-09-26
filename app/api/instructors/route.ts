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
      select: {
        id: true,
        name: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
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
