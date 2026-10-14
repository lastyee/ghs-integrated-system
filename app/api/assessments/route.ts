import { AssessmentType, AssessmentSessionStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  requireInstructorClassAccess,
  requireLinkedInstructor,
} from "@/lib/instructor-ownership";
import { assessmentCreateSchema } from "@/schemas/assessment";

const prisma = new PrismaClient();

export const assessmentSelect = {
  id: true,
  classId: true,
  subjectId: true,
  name: true,
  description: true,
  type: true,
  maxScore: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  class: {
    select: {
      id: true,
      name: true,
      batch: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  subject: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("assessment:read");
    const { searchParams } = new URL(request.url);

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search")?.trim() || "";
    const queryClassId = searchParams.get("classId");
    const querySubjectId = searchParams.get("subjectId");
    const queryType = searchParams.get("type");
    const queryStatus = searchParams.get("status");

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const baseWhere: Prisma.AssessmentWhereInput = {
      deletedAt: null,
      class: {
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
      subject: { deletedAt: null },
    };
    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      baseWhere.class = {
        is: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
          instructorId: instructor.id,
        },
      };
      if (queryClassId && queryClassId !== "ALL") {
        await requireInstructorClassAccess(authenticatedUser, queryClassId);
      }
    } else if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }

      baseWhere.class = {
        is: {
          deletedAt: null,
          batch: {
            deletedAt: null,
            program: { deletedAt: null },
            enrollments: {
              some: {
                studentId: student.id,
                status: "ACTIVE",
                deletedAt: null,
              },
            },
          },
          instructor: { deletedAt: null },
        },
      };

      if (queryClassId && queryClassId !== "ALL") {
        const isEnrolled = await prisma.enrollment.findFirst({
          where: {
            studentId: student.id,
            status: "ACTIVE",
            deletedAt: null,
            batch: {
              deletedAt: null,
              classes: {
                some: {
                  id: queryClassId,
                  deletedAt: null,
                },
              },
            },
          },
          select: { id: true },
        });

        if (!isEnrolled) {
          throw new ForbiddenError("Student is not enrolled in this class.");
        }
      }
    }

    if (queryClassId && queryClassId !== "ALL") {
      baseWhere.classId = queryClassId;
    }

    if (querySubjectId && querySubjectId !== "ALL") {
      baseWhere.subjectId = querySubjectId;
    }

    if (queryType && queryType !== "ALL" && Object.values(AssessmentType).includes(queryType as AssessmentType)) {
      baseWhere.type = queryType as AssessmentType;
    }

    if (queryStatus && queryStatus !== "ALL" && Object.values(AssessmentSessionStatus).includes(queryStatus as AssessmentSessionStatus)) {
      baseWhere.status = queryStatus as AssessmentSessionStatus;
    }

    const searchWhere: Prisma.AssessmentWhereInput = searchStr
      ? {
          OR: [
            { name: { contains: searchStr, mode: "insensitive" as const } },
            { description: { contains: searchStr, mode: "insensitive" as const } },
            { subject: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { class: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { class: { batch: { name: { contains: searchStr, mode: "insensitive" as const } } } },
          ],
        }
      : {};

    const where: Prisma.AssessmentWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const statsWhere: Prisma.AssessmentWhereInput = {
      deletedAt: null,
      class: baseWhere.class,
      subject: { deletedAt: null },
    };

    const [assessments, total, totalStats, openStats, completedStats] = await prisma.$transaction([
      prisma.assessment.findMany({
        where,
        skip,
        take: limit,
        select: {
          ...assessmentSelect,
          _count: {
            select: {
              scores: {
                where: { deletedAt: null, student: { deletedAt: null } },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.assessment.count({ where }),
      prisma.assessment.count({ where: statsWhere }),
      prisma.assessment.count({ where: { ...statsWhere, status: AssessmentSessionStatus.OPEN } }),
      prisma.assessment.count({ where: { ...statsWhere, status: AssessmentSessionStatus.COMPLETED } }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return Response.json(
      {
        data: assessments,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: totalStats,
          open: openStats,
          active: openStats,
          completed: completedStats,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await requirePermission("assessment:create");

    if (
      authenticatedUser.role !== "SUPER_ADMIN" &&
      authenticatedUser.role !== "ADMIN" &&
      authenticatedUser.role !== "INSTRUCTOR"
    ) {
      throw new ForbiddenError();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = assessmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      classId: rawClassId,
      studentId,
      subjectId,
      name,
      description,
      type,
      maxScore,
      status,
    } = parsed.data;

    // Validate Subject exists
    const subjectRecord = await prisma.subject.findUnique({
      where: { id: subjectId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!subjectRecord) {
      return Response.json(
        { message: "Subject not found." },
        { status: 404 }
      );
    }

    let resolvedClassId = rawClassId;

    if (studentId) {
      const student = await prisma.student.findUnique({
        where: { id: studentId, deletedAt: null },
        include: {
          enrollments: {
            where: { deletedAt: null, status: "ACTIVE" },
            include: {
              batch: {
                include: {
                  classes: {
                    where: { deletedAt: null },
                    include: {
                      schedules: {
                        where: { deletedAt: null },
                        select: { subjectId: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!student) {
        return Response.json(
          { message: "Peserta tidak ditemukan." },
          { status: 404 }
        );
      }

      if (student.enrollments.length === 0) {
        return Response.json(
          { message: "Peserta tidak memiliki enrollment aktif." },
          { status: 400 }
        );
      }

      if (student.enrollments.length > 1) {
        return Response.json(
          {
            message:
              "Peserta memiliki lebih dari satu enrollment aktif. Sistem belum memiliki aturan untuk memilih kelasnya secara otomatis.",
          },
          { status: 400 }
        );
      }

      const activeEnrollment = student.enrollments[0];
      const batchClasses = activeEnrollment.batch.classes;

      if (batchClasses.length === 0) {
        return Response.json(
          { message: "Tidak ditemukan kelas aktif pada batch peserta." },
          { status: 400 }
        );
      }

      // Cari kelas yang sesuai dengan subjectId pada batch peserta
      // 1. Berdasarkan jadwal aktif yang menggunakan mata pelajaran ini
      let matchingClasses = batchClasses.filter((c) =>
        c.schedules.some((s) => s.subjectId === subjectId)
      );

      // 2. Jika tidak ada jadwal, cocokkan berdasarkan kesamaan nama kelas dengan mata pelajaran
      if (matchingClasses.length === 0) {
        const subNameLower = subjectRecord.name.toLowerCase();
        matchingClasses = batchClasses.filter((c) =>
          c.name.toLowerCase().includes(subNameLower)
        );
      }

      // 3. Jika masih belum ditemukan dan batch hanya memiliki 1 kelas tunggal
      if (matchingClasses.length === 0 && batchClasses.length === 1) {
        matchingClasses = batchClasses;
      }

      if (matchingClasses.length === 0) {
        return Response.json(
          { message: "Kelas untuk mata pelajaran ini tidak ditemukan pada batch peserta." },
          { status: 400 }
        );
      }

      if (matchingClasses.length > 1) {
        return Response.json(
          {
            message:
              "Ditemukan lebih dari satu kelas aktif untuk mata pelajaran ini pada batch peserta. Sistem belum memiliki aturan untuk memilihnya.",
          },
          { status: 400 }
        );
      }

      const determinedClass = matchingClasses[0];

      // Validasi jika client juga mengirimkan classId (Ketentuan 4: Jangan mempercayai classId dari client tanpa validasi)
      if (rawClassId && rawClassId !== determinedClass.id) {
        return Response.json(
          {
            message:
              "ID kelas yang dikirimkan tidak sesuai dengan kelas aktif peserta untuk mata pelajaran ini.",
          },
          { status: 400 }
        );
      }

      resolvedClassId = determinedClass.id;
    }

    if (!resolvedClassId) {
      return Response.json(
        { message: "Kelas tidak dapat ditentukan." },
        { status: 400 }
      );
    }

    // Validate Class exists
    const classRecord = await prisma.class.findUnique({
      where: {
        id: resolvedClassId,
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
      select: { id: true, instructorId: true },
    });
    if (!classRecord) {
      return Response.json(
        { message: "Class not found." },
        { status: 404 }
      );
    }
    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (classRecord.instructorId !== instructor.id) {
        throw new ForbiddenError();
      }
      const scheduledSubject = await prisma.schedule.findFirst({
        where: {
          classId: resolvedClassId,
          subjectId,
          instructorId: instructor.id,
        },
        select: { id: true },
      });
      if (!scheduledSubject) {
        throw new ForbiddenError();
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.create({
        data: {
          classId: resolvedClassId,
          subjectId,
          name,
          description: description ?? null,
          type,
          maxScore,
          status: status ?? AssessmentSessionStatus.OPEN,
        },
        select: assessmentSelect,
      });

      await createAuditLog(
        tx,
        authenticatedUser,
        {
          action: "CREATE",
          entity: "Assessment",
          entityId: assessment.id,
          changes: {
            classId: assessment.classId,
            subjectId: assessment.subjectId,
            name: assessment.name,
            type: assessment.type,
            maxScore: assessment.maxScore,
            status: assessment.status,
          },
        }
      );

      return assessment;
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return Response.json(
    { message: "Method Not Allowed. Assessment deletion is not supported." },
    { status: 405, headers: { Allow: "GET, POST" } }
  );
}
