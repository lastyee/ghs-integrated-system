import { PrismaClient, SubmissionStatus } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import { requireLinkedInstructor } from "@/lib/instructor-ownership";
import { ASSIGNMENTS_BUCKET, getStorageProvider } from "@/lib/storage";
import { submissionGradeSchema } from "@/schemas/assignment";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("assignment-submission:read");
    const { id: assignmentId, submissionId } = await params;

    const submission = await prisma.assignmentSubmission.findFirst({
      where: {
        id: submissionId,
        assignmentId,
        deletedAt: null,
      },
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            instructorId: true,
            maxScore: true,
            class: {
              select: {
                id: true,
                instructorId: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            nim: true,
            name: true,
            userId: true,
          },
        },
        gradedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!submission) {
      return Response.json({ message: "Submission not found." }, { status: 404 });
    }

    // Role-based access verification
    if (authenticatedUser.role === "STUDENT") {
      if (submission.student.userId !== authenticatedUser.id) {
        throw new ForbiddenError(
          "Mahasiswa tidak memiliki wewenang untuk mengakses berkas pengumpulan mahasiswa lain."
        );
      }
    } else if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (
        submission.assignment.instructorId !== instructor.id &&
        submission.assignment.class.instructorId !== instructor.id
      ) {
        throw new ForbiddenError(
          "Instruktur tidak memiliki wewenang untuk mengakses penugasan kelas ini."
        );
      }
    }

    // Generate short-lived private signed URL for secure download
    let downloadUrl: string | null = null;
    try {
      const storage = getStorageProvider();
      downloadUrl = await storage.createSignedUrl({
        bucket: ASSIGNMENTS_BUCKET,
        path: submission.storagePath,
        expiresIn: 900, // 15 minutes
      });
    } catch (err) {
      console.error("Failed to generate signed URL for submission:", err);
    }

    return Response.json(
      {
        data: {
          id: submission.id,
          assignmentId: submission.assignmentId,
          assignmentTitle: submission.assignment.title,
          student: {
            id: submission.student.id,
            nim: submission.student.nim,
            name: submission.student.name,
          },
          status: submission.status,
          content: submission.content,
          fileName: submission.fileName,
          fileSize: submission.fileSize,
          fileType: submission.fileType,
          submittedAt: submission.submittedAt,
          attemptCount: submission.attemptCount,
          score: submission.score,
          feedback: submission.feedback,
          gradedAt: submission.gradedAt,
          gradedBy: submission.gradedBy,
          downloadUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/assignments/[id]/submissions/[submissionId] error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("assignment-submission:grade");
    const { id: assignmentId, submissionId } = await params;

    if (authenticatedUser.role === "STUDENT") {
      throw new ForbiddenError("Mahasiswa tidak diizinkan untuk menilai tugas.");
    }

    const submission = await prisma.assignmentSubmission.findFirst({
      where: {
        id: submissionId,
        assignmentId,
        deletedAt: null,
      },
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            maxScore: true,
            instructorId: true,
            class: {
              select: {
                id: true,
                instructorId: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      return Response.json({ message: "Submission not found." }, { status: 404 });
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (
        submission.assignment.instructorId !== instructor.id &&
        submission.assignment.class.instructorId !== instructor.id
      ) {
        throw new ForbiddenError(
          "Instruktur tidak memiliki wewenang untuk menilai penugasan kelas ini."
        );
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ message: "Invalid JSON in request body." }, { status: 400 });
    }

    const parsed = submissionGradeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validasi nilai gagal.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { score, feedback } = parsed.data;

    if (score > submission.assignment.maxScore) {
      return Response.json(
        {
          message: `Nilai (${score}) tidak boleh melebihi nilai maksimum tugas (${submission.assignment.maxScore}).`,
        },
        { status: 400 }
      );
    }

    const gradedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.assignmentSubmission.update({
        where: { id: submission.id },
        data: {
          score,
          feedback: feedback ?? null,
          status: SubmissionStatus.GRADED,
          gradedById: authenticatedUser.id,
          gradedAt,
        },
        select: {
          id: true,
          assignmentId: true,
          studentId: true,
          status: true,
          score: true,
          feedback: true,
          gradedById: true,
          gradedAt: true,
          attemptCount: true,
          submittedAt: true,
          fileName: true,
        },
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "GRADE",
        entity: "AssignmentSubmission",
        entityId: submission.id,
        changes: {
          score: { before: submission.score, after: score },
          feedback: { before: submission.feedback, after: feedback ?? null },
          status: { before: submission.status, after: SubmissionStatus.GRADED },
          gradedById: authenticatedUser.id,
        },
      });

      return result;
    });

    return Response.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/assignments/[id]/submissions/[submissionId] error:", error);
    return Response.json({ message: "Internal server error." }, { status: 500 });
  }
}
