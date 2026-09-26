import { PrismaClient } from "@prisma/client";
import {
  ForbiddenError,
  requireAuthenticatedUser,
} from "@/lib/authorization";

const prisma = new PrismaClient();

export type OwnedStudent = {
  id: string;
  userId: string;
};

export async function requireStudentOwnership(
  studentId: string,
): Promise<OwnedStudent> {
  const authenticatedUser = await requireAuthenticatedUser();
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!student || student.userId !== authenticatedUser.id) {
    throw new ForbiddenError();
  }

  return {
    id: student.id,
    userId: student.userId,
  };
}
