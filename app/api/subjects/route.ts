import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { subjectCreateSchema } from "@/schemas/subject";

const prisma = new PrismaClient();

const subjectSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  try {
    await requirePermission("subject:read");

    const subjects = await prisma.subject.findMany({
      select: subjectSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return Response.json({ data: subjects });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read subjects", error);
    return Response.json({ error: "Unable to load subjects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("subject:create");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = subjectCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const subject = await prisma.$transaction(async (transaction) => {
      const createdSubject = await transaction.subject.create({
        data: {
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description,
        },
        select: subjectSelect,
      });

      await createAuditLog(transaction, authenticatedUser, {
        action: "CREATE",
        entity: "Subject",
        entityId: createdSubject.id,
        changes: {
          fields: {
            code: { after: createdSubject.code },
            name: { after: createdSubject.name },
            description: { after: createdSubject.description },
          },
        },
      });

      return createdSubject;
    });

    return Response.json({ data: subject }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Subject with this code already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create subject", error);
    return Response.json({ error: "Unable to create subject" }, { status: 500 });
  }
}

