import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";

const prisma = new PrismaClient();

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
};

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = status === 401 ? "UnauthorizedError" : "ForbiddenError";
    this.status = status;
  }
}

export class UnauthorizedError extends AuthorizationError {
  constructor(message = "Authentication required") {
    super(401, message);
  }
}

export class ForbiddenError extends AuthorizationError {
  constructor(message = "Permission denied") {
    super(403, message);
  }
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.role) {
    throw new UnauthorizedError();
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function requirePermission(permissionName: string): Promise<AuthenticatedUser> {
  const sessionUser = await requireAuthenticatedUser();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: {
        select: {
          name: true,
          permissions: {
            where: {
              permission: {
                name: permissionName,
              },
            },
            select: {
              permission: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError();
  }

  if (user.role.permissions.length === 0) {
    throw new ForbiddenError();
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
  };
}

export async function userHasPermission(userId: string, permissionName: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: {
        select: {
          permissions: {
            where: {
              permission: { name: permissionName },
            },
            select: { permissionId: true },
          },
        },
      },
    },
  });

  return Boolean(user?.role.permissions.length);
}

export function authorizationErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  throw error;
}
