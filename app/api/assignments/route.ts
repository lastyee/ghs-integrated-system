import { randomUUID } from "node:crypto";
import { AssignmentStatus, Prisma, PrismaClient } from "@prisma/client";
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
import {
  ASSIGNMENTS_BUCKET,
  generateAssignmentInstructionPath,
  getStorageProvider,
  sanitizeFileName,
} from "@/lib/storage";
import { assignmentCreateSchema } from "@/schemas/assignment";
import {
  validateAssignmentFileConstraints,
  validateAssignmentFileSignature,
} from "@/schemas/assignment-file";

const prisma = new PrismaClient();

export const assignmentSelect = {
  id: true,
  title: true,
  description: true,
  classId: true,
  subjectId: true,
  scheduleId: true,
  instructorId: true,
  dueDate: true,
  allowLateSubmission: true,
  maxScore: true,
  status: true,
  attachmentName: true,
  attachmentSize: true,
  attachmentType: true,
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
  schedule: {
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      topic: true,
      room: true,
    },
  },
  instructor: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      submissions: {
        where: { deletedAt: null },
      },
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    const authenticatedUser = await requirePermission("assignment:read");
    const { searchParams } = new URL(request.url);

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");
    const searchStr = searchParams.get("search")?.trim() || "";
    const queryClassId = searchParams.get("classId");
    const querySubjectId = searchParams.get("subjectId");
    const queryBatchId = searchParams.get("batchId");
    const queryStatus = searchParams.get("status");

    const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(limitStr || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const baseWhere: Prisma.AssignmentWhereInput = {
      deletedAt: null,
      class: {
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
      },
      subject: { deletedAt: null },
      instructor: { deletedAt: null },
    };

    let studentForSelect: { id: string } | null = null;

    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      baseWhere.class = {
        is: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructorId: instructor.id,
        },
      };

      if (queryClassId && queryClassId !== "ALL") {
        await requireInstructorClassAccess(authenticatedUser, queryClassId);
        baseWhere.classId = queryClassId;
      }
    } else if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found for this user.");
      }
      studentForSelect = student;

      baseWhere.status = AssignmentStatus.PUBLISHED;
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
        },
      };

      if (queryClassId && queryClassId !== "ALL") {
        const isEnrolled = await prisma.enrollment.findFirst({
          where: {
            studentId: student.id,
            status: "ACTIVE",
            deletedAt: null,
            batch: {
              classes: {
                some: { id: queryClassId, deletedAt: null },
              },
            },
          },
          select: { id: true },
        });

        if (!isEnrolled) {
          throw new ForbiddenError("Mahasiswa tidak terdaftar pada kelas yang diminta.");
        }
        baseWhere.classId = queryClassId;
      }
    } else {
      // SUPER_ADMIN / ADMIN / ACADEMIC_STAFF / MANAGEMENT
      if (queryClassId && queryClassId !== "ALL") {
        baseWhere.classId = queryClassId;
      }
    }

    if (querySubjectId && querySubjectId !== "ALL" && querySubjectId.trim()) {
      baseWhere.subjectId = querySubjectId.trim();
    }

    if (queryBatchId && queryBatchId !== "ALL" && queryBatchId.trim()) {
      baseWhere.class = {
        is: {
          ...((baseWhere.class as Prisma.ClassWhereInput) || {}),
          batchId: queryBatchId.trim(),
        },
      };
    }

    if (
      queryStatus &&
      queryStatus !== "ALL" &&
      Object.values(AssignmentStatus).includes(queryStatus as AssignmentStatus)
    ) {
      baseWhere.status = queryStatus as AssignmentStatus;
    }

    const searchWhere: Prisma.AssignmentWhereInput = searchStr
      ? {
          OR: [
            { title: { contains: searchStr, mode: "insensitive" as const } },
            { description: { contains: searchStr, mode: "insensitive" as const } },
            { subject: { name: { contains: searchStr, mode: "insensitive" as const } } },
            { subject: { code: { contains: searchStr, mode: "insensitive" as const } } },
            { class: { name: { contains: searchStr, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const where: Prisma.AssignmentWhereInput = {
      ...baseWhere,
      ...searchWhere,
    };

    const statsWhere = { ...baseWhere };

    const dynamicSelect = {
      ...assignmentSelect,
      ...(authenticatedUser.role === "STUDENT" && studentForSelect
        ? {
            submissions: {
              where: { studentId: studentForSelect.id, deletedAt: null },
              select: {
                id: true,
                status: true,
                submittedAt: true,
                attemptCount: true,
                score: true,
                feedback: true,
                gradedAt: true,
              },
            },
          }
        : {}),
    };

    const [assignments, total, totalStats, publishedStats, draftStats, closedStats] =
      await prisma.$transaction([
        prisma.assignment.findMany({
          where,
          skip,
          take: limit,
          select: dynamicSelect,
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        }),
        prisma.assignment.count({ where }),
        prisma.assignment.count({ where: statsWhere }),
        prisma.assignment.count({
          where: { ...statsWhere, status: AssignmentStatus.PUBLISHED },
        }),
        prisma.assignment.count({
          where: { ...statsWhere, status: AssignmentStatus.DRAFT },
        }),
        prisma.assignment.count({
          where: { ...statsWhere, status: AssignmentStatus.CLOSED },
        }),
      ]);

    const mappedAssignments = assignments.map((a) => {
      if (authenticatedUser.role === "STUDENT") {
        const itemWithSubs = a as typeof a & {
          submissions?: Array<{
            id: string;
            status: string;
            submittedAt: Date;
            attemptCount: number;
            score: number | null;
            feedback: string | null;
            gradedAt: Date | null;
          }>;
        };
        const { submissions, ...rest } = itemWithSubs;
        return {
          ...rest,
          mySubmission: submissions?.[0] ?? null,
        };
      }
      return a;
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return Response.json(
      {
        data: mappedAssignments,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        stats: {
          total: totalStats,
          published: publishedStats,
          draft: draftStats,
          closed: closedStats,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/assignments error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let uploadedStoragePath: string | null = null;
  const storage = getStorageProvider();

  try {
    const authenticatedUser = await requirePermission("assignment:create");

    if (
      authenticatedUser.role !== "SUPER_ADMIN" &&
      authenticatedUser.role !== "ADMIN" &&
      authenticatedUser.role !== "INSTRUCTOR"
    ) {
      throw new ForbiddenError();
    }

    const contentType = request.headers.get("content-type") || "";
    let rawData: Record<string, unknown> = {};
    let fileBlob: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return Response.json(
          { message: "Invalid form data in request body." },
          { status: 400 }
        );
      }

      for (const [key, value] of formData.entries()) {
        if (key === "file" && typeof value === "object" && "size" in value) {
          fileBlob = value as File;
        } else if (typeof value === "string") {
          if (key === "maxScore") {
            rawData[key] = parseFloat(value);
          } else if (key === "allowLateSubmission") {
            rawData[key] = value === "true" || value === "1";
          } else {
            rawData[key] = value;
          }
        }
      }
    } else {
      try {
        rawData = await request.json();
      } catch {
        return Response.json(
          { message: "Invalid JSON in request body." },
          { status: 400 }
        );
      }
    }

    const parsed = assignmentCreateSchema.safeParse(rawData);
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
      classId,
      subjectId,
      scheduleId,
      title,
      description,
      dueDate,
      allowLateSubmission,
      maxScore,
      status,
      instructorId: requestedInstructorId,
    } = parsed.data;

    // 1. Validate Class exists and is active
    const classRecord = await prisma.class.findUnique({
      where: {
        id: classId,
        deletedAt: null,
        batch: { deletedAt: null, program: { deletedAt: null } },
        instructor: { deletedAt: null },
      },
      select: {
        id: true,
        instructorId: true,
        batch: {
          select: {
            id: true,
            programId: true,
          },
        },
      },
    });

    if (!classRecord) {
      return Response.json({ message: "Class not found." }, { status: 404 });
    }

    // 2. Validate Instructor ownership & resolve responsible instructor
    let resolvedInstructorId: string;
    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (classRecord.instructorId !== instructor.id) {
        throw new ForbiddenError();
      }
      resolvedInstructorId = instructor.id;
    } else {
      // SUPER_ADMIN or ADMIN
      if (requestedInstructorId) {
        const instructor = await prisma.instructor.findUnique({
          where: { id: requestedInstructorId, deletedAt: null },
          select: { id: true },
        });
        if (!instructor) {
          return Response.json(
            { message: "Instructor not found." },
            { status: 404 }
          );
        }
        resolvedInstructorId = instructor.id;
      } else {
        resolvedInstructorId = classRecord.instructorId;
      }
    }

    // 3. Validate Subject is genuinely related to Class
    const subjectRecord = await prisma.subject.findUnique({
      where: { id: subjectId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!subjectRecord) {
      return Response.json({ message: "Subject not found." }, { status: 404 });
    }

    const isSubjectInProgram = await prisma.programSubject.findUnique({
      where: {
        programId_subjectId: {
          programId: classRecord.batch.programId,
          subjectId,
        },
      },
      select: { programId: true },
    });

    const hasScheduleForSubject = await prisma.schedule.findFirst({
      where: {
        classId,
        subjectId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!isSubjectInProgram && !hasScheduleForSubject) {
      return Response.json(
        {
          message:
            "Mata kuliah tidak terkait dengan kurikulum program atau jadwal kelas yang dipilih.",
        },
        { status: 400 }
      );
    }

    // 4. Validate optional scheduleId
    if (scheduleId) {
      const scheduleRecord = await prisma.schedule.findUnique({
        where: { id: scheduleId, deletedAt: null },
        select: { id: true, classId: true, subjectId: true },
      });

      if (!scheduleRecord) {
        return Response.json(
          { message: "Sesi jadwal tidak ditemukan." },
          { status: 404 }
        );
      }

      if (
        scheduleRecord.classId !== classId ||
        scheduleRecord.subjectId !== subjectId
      ) {
        return Response.json(
          {
            message:
              "Sesi jadwal tidak sesuai dengan kelas dan mata kuliah yang dipilih.",
          },
          { status: 400 }
        );
      }
    }

    // 5. Handle instruction attachment if uploaded
    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    let attachmentSize: number | null = null;
    let attachmentType: string | null = null;

    const assignmentId = `asgn_${randomUUID().replace(/-/g, "")}`;

    if (fileBlob && typeof fileBlob.size === "number" && fileBlob.size > 0) {
      const fileValidation = validateAssignmentFileConstraints({
        name: fileBlob.name,
        size: fileBlob.size,
        type: fileBlob.type,
      });

      if (!fileValidation.valid) {
        return Response.json(
          { message: fileValidation.error || "File validation failed." },
          { status: 400 }
        );
      }

      const safeExt = fileValidation.extension!;
      const safeFileName = sanitizeFileName(fileBlob.name);
      const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

      const signatureValidation = validateAssignmentFileSignature(
        fileBuffer,
        safeExt,
        fileBlob.type
      );

      if (!signatureValidation.valid) {
        return Response.json(
          { message: signatureValidation.error || "Invalid file signature." },
          { status: 400 }
        );
      }

      attachmentPath = generateAssignmentInstructionPath(assignmentId, safeExt);
      attachmentName = safeFileName;
      attachmentSize = fileBlob.size;
      attachmentType = fileBlob.type;

      // Upload to private storage provider
      await storage.upload({
        bucket: ASSIGNMENTS_BUCKET,
        path: attachmentPath,
        file: fileBuffer,
        contentType: fileBlob.type,
      });
      uploadedStoragePath = attachmentPath;
    }

    // 6. Insert Assignment and record Audit Log in transaction
    let createdAssignment;
    try {
      createdAssignment = await prisma.$transaction(async (tx) => {
        const assignment = await tx.assignment.create({
          data: {
            id: assignmentId,
            title,
            description: description ?? null,
            classId,
            subjectId,
            scheduleId: scheduleId ?? null,
            instructorId: resolvedInstructorId,
            dueDate: new Date(dueDate),
            allowLateSubmission: allowLateSubmission ?? false,
            maxScore: maxScore ?? 100,
            status: status ?? AssignmentStatus.PUBLISHED,
            attachmentPath,
            attachmentName,
            attachmentSize,
            attachmentType,
          },
          select: assignmentSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: "CREATE",
          entity: "Assignment",
          entityId: assignment.id,
          changes: {
            title: assignment.title,
            classId: assignment.classId,
            subjectId: assignment.subjectId,
            scheduleId: assignment.scheduleId,
            instructorId: assignment.instructorId,
            dueDate: assignment.dueDate,
            allowLateSubmission: assignment.allowLateSubmission,
            maxScore: assignment.maxScore,
            status: assignment.status,
            attachmentName: assignment.attachmentName,
          },
        });

        return assignment;
      });
    } catch (dbError) {
      // Compensation: Delete newly uploaded storage file if DB transaction fails
      if (uploadedStoragePath) {
        try {
          await storage.delete({
            bucket: ASSIGNMENTS_BUCKET,
            path: uploadedStoragePath,
          });
        } catch (cleanupError) {
          console.error("Storage cleanup failed after DB error:", cleanupError);
        }
      }
      throw dbError;
    }

    return Response.json(createdAssignment, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("POST /api/assignments error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
