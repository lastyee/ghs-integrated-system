import { PrismaClient } from "@prisma/client";
import { ForbiddenError, type AuthenticatedUser } from "@/lib/authorization";

const prisma = new PrismaClient();

export async function requireLinkedInstructor(
  user: AuthenticatedUser,
): Promise<{ id: string }> {
  const instructor = await prisma.instructor.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true },
  });

  if (!instructor) {
    throw new ForbiddenError("Instructor account is not linked to an instructor record.");
  }

  return instructor;
}

export async function requireInstructorClassAccess(
  user: AuthenticatedUser,
  classId: string,
): Promise<{ id: string }> {
  const instructor = await requireLinkedInstructor(user);
  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    select: { instructorId: true },
  });

  if (!classRecord || classRecord.instructorId !== instructor.id) {
    throw new ForbiddenError();
  }

  return instructor;
}

export async function requireInstructorScheduleAccess(
  user: AuthenticatedUser,
  scheduleId: string,
): Promise<{ id: string }> {
  const instructor = await requireLinkedInstructor(user);
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { instructorId: true },
  });

  if (!schedule || schedule.instructorId !== instructor.id) {
    throw new ForbiddenError();
  }

  return instructor;
}

export async function requireInstructorStudentAccess(
  user: AuthenticatedUser,
  studentId: string,
): Promise<{ id: string }> {
  const instructor = await requireLinkedInstructor(user);
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      enrollments: {
        some: {
          batch: {
            classes: {
              some: { instructorId: instructor.id },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!student) {
    throw new ForbiddenError();
  }

  return instructor;
}
