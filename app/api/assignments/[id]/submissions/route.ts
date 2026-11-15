import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, SubmissionStatus } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireInstructorAssignmentAccess } from "@/lib/instructor-ownership";
import {
  ASSIGNMENTS_BUCKET,
  generateAssignmentSubmissionPath,
  getStorageProvider,
  sanitizeFileName,
} from "@/lib/storage";
import { submissionCreateSchema } from "@/schemas/assignment";
import {
  validateAssignmentFileConstraints,
  validateAssignmentFileSignature,
} from "@/schemas/assignment-file";

const prisma = new PrismaClient();

const submissionSelect = {
  id: true,
  assignmentId: true,
  studentId: true,
  status: true,
  content: true,
  fileName: true,
  fileSize: true,
  fileType: true,
  submittedAt: true,
  attemptCount: true,
  score: true,
  feedback: true,
  gradedAt: true,
  student: {
    select: {
      id: true,
      nim: true,
      name: true,
    },
  },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("assignment-submission:read");
    const { id: assignmentId } = await params;

    // Students are strictly forbidden from viewing the class-wide submission recap
    if (authenticatedUser.role === "STUDENT") {
      throw new ForbiddenError(
        "Mahasiswa tidak memiliki wewenang untuk melihat rekap pengumpulan kelas."
      );
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: {
        id: true,
        title: true,
        dueDate: true,
        allowLateSubmission: true,
        maxScore: true,
        status: true,
        instructorId: true,
        class: {
          select: {
            id: true,
            name: true,
            instructorId: true,
            batchId: true,
            batch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return Response.json({ message: "Assignment not found." }, { status: 404 });
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorAssignmentAccess(authenticatedUser, assignmentId);
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const statusFilter = searchParams.get("status")?.trim() || "";

    // 1. Fetch all actively enrolled students in the assignment's class batch
    const enrollments = await prisma.enrollment.findMany({
      where: {
        batchId: assignment.class.batchId,
        status: "ACTIVE",
        deletedAt: null,
        student: { deletedAt: null },
      },
      select: {
        student: {
          select: {
            id: true,
            nim: true,
            name: true,
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { student: { name: "asc" } },
    });

    // 2. Fetch all submissions for this assignment
    const submissions = await prisma.assignmentSubmission.findMany({
      where: {
        assignmentId: assignment.id,
        deletedAt: null,
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        content: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        submittedAt: true,
        attemptCount: true,
        score: true,
        feedback: true,
        gradedAt: true,
        gradedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const submissionMap = new Map(submissions.map((s) => [s.studentId, s]));

    let submittedCount = 0;
    let lateCount = 0;
    let gradedCount = 0;
    let unsubmittedCount = 0;

    const allItems = enrollments.map((e) => {
      const sub = submissionMap.get(e.student.id);
      if (sub) {
        submittedCount++;
        if (sub.status === SubmissionStatus.LATE) lateCount++;
        if (sub.status === SubmissionStatus.GRADED) gradedCount++;

        return {
          student: e.student,
          isSubmitted: true,
          submission: {
            id: sub.id,
            status: sub.status,
            content: sub.content,
            fileName: sub.fileName,
            fileSize: sub.fileSize,
            fileType: sub.fileType,
            submittedAt: sub.submittedAt,
            attemptCount: sub.attemptCount,
            score: sub.score,
            feedback: sub.feedback,
            gradedAt: sub.gradedAt,
            gradedBy: sub.gradedBy,
          },
        };
      } else {
        unsubmittedCount++;
        return {
          student: e.student,
          isSubmitted: false,
          submission: null,
        };
      }
    });

    // Apply optional status and search filtering in memory on the batch
    const filteredItems = allItems.filter((item) => {
      if (statusFilter && statusFilter !== "ALL") {
        if (statusFilter === "NOT_SUBMITTED" && item.isSubmitted) return false;
        if (statusFilter !== "NOT_SUBMITTED") {
          if (!item.isSubmitted || item.submission?.status !== statusFilter) {
            return false;
          }
        }
      }

      if (search) {
        const nameMatch = item.student.name.toLowerCase().includes(search);
        const nimMatch = item.student.nim.toLowerCase().includes(search);
        const emailMatch = item.student.user?.email?.toLowerCase().includes(search) ?? false;
        if (!nameMatch && !nimMatch && !emailMatch) {
          return false;
        }
      }

      return true;
    });

    return Response.json(
      {
        data: filteredItems,
        stats: {
          totalEnrolled: enrollments.length,
          submitted: submittedCount,
          unsubmitted: unsubmittedCount,
          late: lateCount,
          graded: gradedCount,
        },
        assignment: {
          id: assignment.id,
          title: assignment.title,
          dueDate: assignment.dueDate,
          allowLateSubmission: assignment.allowLateSubmission,
          maxScore: assignment.maxScore,
          status: assignment.status,
          class: assignment.class,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/assignments/[id]/submissions error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedStoragePath: string | null = null;
  const storage = getStorageProvider();

  try {
    const authenticatedUser = await requirePermission("assignment-submission:create");
    const { id: assignmentId } = await params;

    // 1. Fetch Assignment and verify active status
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: {
        id: true,
        title: true,
        dueDate: true,
        allowLateSubmission: true,
        maxScore: true,
        status: true,
        classId: true,
        class: {
          select: {
            id: true,
            batchId: true,
          },
        },
      },
    });

    if (!assignment) {
      return Response.json({ message: "Assignment not found." }, { status: 404 });
    }

    if (assignment.status !== "PUBLISHED") {
      return Response.json(
        {
          message: `Penugasan tidak menerima pengumpulan (status: ${assignment.status}).`,
        },
        { status: 400 }
      );
    }

    // 2. Parse multipart form data
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { message: "Pengumpulan tugas memerlukan request multipart/form-data." },
        { status: 400 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json(
        { message: "Invalid form data in request body." },
        { status: 400 }
      );
    }

    // 3. Resolve authenticated Student profile
    let resolvedStudentId: string;
    if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Profil mahasiswa tidak ditemukan.");
      }
      resolvedStudentId = student.id;
    } else if (
      authenticatedUser.role === "SUPER_ADMIN" ||
      authenticatedUser.role === "ADMIN"
    ) {
      const requestedStudentId = formData.get("studentId");
      if (typeof requestedStudentId === "string" && requestedStudentId.trim()) {
        const student = await prisma.student.findUnique({
          where: { id: requestedStudentId.trim(), deletedAt: null },
          select: { id: true },
        });

        if (!student) {
          return Response.json({ message: "Student not found." }, { status: 404 });
        }
        resolvedStudentId = student.id;
      } else {
        return Response.json(
          { message: "studentId wajib diisi untuk pengumpulan administratif." },
          { status: 400 }
        );
      }
    } else {
      throw new ForbiddenError(
        "Hanya mahasiswa atau administrator yang dapat mengumpulkan tugas."
      );
    }

    // 4. Verify Student is actively enrolled in the batch of this assignment's class
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: resolvedStudentId,
        batchId: assignment.class.batchId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!enrollment) {
      return Response.json(
        { message: "Mahasiswa tidak terdaftar aktif pada kelas tugas ini." },
        { status: 403 }
      );
    }

    // 5. Evaluate Deadline Policies (Server-side timestamp)
    const now = new Date();
    const isLate = now > assignment.dueDate;

    if (isLate && !assignment.allowLateSubmission) {
      return Response.json(
        {
          message:
            "Batas waktu pengumpulan telah terlewati dan pengumpulan terlambat tidak diizinkan.",
        },
        { status: 400 }
      );
    }

    // 6. Check existing submission and resubmission policies
    const existingSubmission = await prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment.id,
          studentId: resolvedStudentId,
        },
      },
      select: {
        id: true,
        status: true,
        score: true,
        attemptCount: true,
        storagePath: true,
        deletedAt: true,
      },
    });

    if (existingSubmission && existingSubmission.deletedAt === null) {
      if (
        existingSubmission.status === SubmissionStatus.GRADED ||
        existingSubmission.score !== null
      ) {
        return Response.json(
          { message: "Tugas yang sudah dinilai tidak dapat dikumpulkan ulang." },
          { status: 400 }
        );
      }
    }

    let newStatus: SubmissionStatus;
    let attemptCount: number;

    if (existingSubmission && existingSubmission.deletedAt === null) {
      newStatus = isLate ? SubmissionStatus.LATE : SubmissionStatus.RESUBMITTED;
      attemptCount = existingSubmission.attemptCount + 1;
    } else {
      newStatus = isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED;
      attemptCount = 1;
    }

    // 7. Validate uploaded file
    const file = formData.get("file");
    if (!file || typeof file === "string" || typeof (file as Blob).size !== "number") {
      return Response.json(
        { message: "Berkas pengumpulan wajib diunggah." },
        { status: 400 }
      );
    }

    const fileBlob = file as File;
    const fileValidation = validateAssignmentFileConstraints({
      name: fileBlob.name,
      size: fileBlob.size,
      type: fileBlob.type,
    });

    if (!fileValidation.valid) {
      return Response.json(
        { message: fileValidation.error || "Validasi berkas gagal." },
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
        { message: signatureValidation.error || "Signature berkas tidak valid." },
        { status: 400 }
      );
    }

    // 8. Validate optional content/note
    const rawContent = formData.get("content");
    let parsedContent: string | null = null;
    if (typeof rawContent === "string" && rawContent.trim()) {
      const parsed = submissionCreateSchema.safeParse({ content: rawContent.trim() });
      if (!parsed.success) {
        return Response.json(
          {
            message: "Validasi catatan pengantar gagal.",
            errors: parsed.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }
      parsedContent = parsed.data.content ?? null;
    }

    // 9. Storage upload with isolated path
    const newStoragePath = generateAssignmentSubmissionPath(
      assignment.id,
      resolvedStudentId,
      safeExt
    );

    await storage.upload({
      bucket: ASSIGNMENTS_BUCKET,
      path: newStoragePath,
      file: fileBuffer,
      contentType: fileBlob.type,
    });
    uploadedStoragePath = newStoragePath;

    // 10. Database Upsert in transaction with audit log & rollback compensation
    const oldStoragePath = existingSubmission?.storagePath ?? null;
    const submissionId =
      existingSubmission?.id ?? `asub_${randomUUID().replace(/-/g, "")}`;

    let savedSubmission;
    try {
      savedSubmission = await prisma.$transaction(async (tx) => {
        const record = await tx.assignmentSubmission.upsert({
          where: {
            assignmentId_studentId: {
              assignmentId: assignment.id,
              studentId: resolvedStudentId,
            },
          },
          create: {
            id: submissionId,
            assignmentId: assignment.id,
            studentId: resolvedStudentId,
            status: newStatus,
            content: parsedContent,
            storagePath: newStoragePath,
            fileName: safeFileName,
            fileSize: fileBlob.size,
            fileType: fileBlob.type,
            submittedAt: now,
            attemptCount,
            score: null,
            feedback: null,
            gradedById: null,
            gradedAt: null,
          },
          update: {
            status: newStatus,
            content: parsedContent,
            storagePath: newStoragePath,
            fileName: safeFileName,
            fileSize: fileBlob.size,
            fileType: fileBlob.type,
            submittedAt: now,
            attemptCount,
            score: null,
            feedback: null,
            gradedById: null,
            gradedAt: null,
            deletedAt: null,
          },
          select: submissionSelect,
        });

        await createAuditLog(tx, authenticatedUser, {
          action: existingSubmission ? "UPDATE" : "CREATE",
          entity: "AssignmentSubmission",
          entityId: record.id,
          changes: {
            assignmentId: assignment.id,
            studentId: resolvedStudentId,
            status: newStatus,
            attemptCount,
            fileName: safeFileName,
            fileSize: fileBlob.size,
            isLate,
          },
        });

        return record;
      });
    } catch (dbError) {
      // Compensation: Delete newly uploaded file if DB transaction fails
      if (uploadedStoragePath) {
        try {
          await storage.delete({
            bucket: ASSIGNMENTS_BUCKET,
            path: uploadedStoragePath,
          });
        } catch (cleanupErr) {
          console.error("Storage cleanup failed after DB error:", cleanupErr);
        }
      }
      throw dbError;
    }

    // Clean up old file after successful commit if path changed
    if (oldStoragePath && oldStoragePath !== newStoragePath) {
      try {
        await storage.delete({
          bucket: ASSIGNMENTS_BUCKET,
          path: oldStoragePath,
        });
      } catch (cleanupOldErr) {
        console.warn("Notice: Old submission file cleanup non-fatal warning:", cleanupOldErr);
      }
    }

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await storage.createSignedUrl({
        bucket: ASSIGNMENTS_BUCKET,
        path: newStoragePath,
        expiresIn: 900,
      });
    } catch (err) {
      console.warn("Notice: Failed to create signed URL for new submission:", err);
    }

    return Response.json({ ...savedSubmission, downloadUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          message:
            "Terdapat pengumpulan tugas yang sedang diproses secara bersamaan. Silakan coba kembali.",
        },
        { status: 409 }
      );
    }
    console.error("POST /api/assignments/[id]/submissions error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}
