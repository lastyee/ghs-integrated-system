import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import { createAuditLog } from "@/lib/audit-log";
import {
  requireInstructorAssignmentAccess,
  requireInstructorClassAccess,
  requireLinkedInstructor,
} from "@/lib/instructor-ownership";
import {
  ASSIGNMENTS_BUCKET,
  generateAssignmentInstructionPath,
  getStorageProvider,
  sanitizeFileName,
} from "@/lib/storage";
import { assignmentUpdateSchema } from "@/schemas/assignment";
import {
  validateAssignmentFileConstraints,
  validateAssignmentFileSignature,
} from "@/schemas/assignment-file";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("assignment:read");
    const { id } = await params;

    const assignment = await prisma.assignment.findFirst({
      where: {
        id,
        deletedAt: null,
        class: {
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
        },
        subject: { deletedAt: null },
      },
      include: {
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
                programId: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
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
            status: true,
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
      },
    });

    if (!assignment) {
      return Response.json({ message: "Assignment not found." }, { status: 404 });
    }

    let mySubmission = null;

    if (authenticatedUser.role === "INSTRUCTOR") {
      const instructor = await requireLinkedInstructor(authenticatedUser);
      if (
        assignment.instructorId !== instructor.id &&
        assignment.class.instructorId !== instructor.id
      ) {
        throw new ForbiddenError();
      }
    } else if (authenticatedUser.role === "STUDENT") {
      const student = await prisma.student.findFirst({
        where: { userId: authenticatedUser.id, deletedAt: null },
        select: { id: true },
      });

      if (!student) {
        throw new ForbiddenError("Student profile not found.");
      }

      // Verify student is enrolled in the batch of this assignment's class
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: student.id,
          batchId: assignment.class.batchId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!enrollment) {
        throw new ForbiddenError("Mahasiswa tidak memiliki akses ke penugasan kelas ini.");
      }

      // Retrieve student's own submission only
      mySubmission = await prisma.assignmentSubmission.findUnique({
        where: {
          assignmentId_studentId: {
            assignmentId: id,
            studentId: student.id,
          },
        },
        select: {
          id: true,
          status: true,
          content: true,
          storagePath: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          submittedAt: true,
          attemptCount: true,
          score: true,
          feedback: true,
          gradedAt: true,
        },
      });
    }

    const storage = getStorageProvider();

    // Generate short-lived signed URL for instruction attachment if available
    let attachmentUrl: string | null = null;
    if (assignment.attachmentPath) {
      try {
        attachmentUrl = await storage.createSignedUrl({
          bucket: ASSIGNMENTS_BUCKET,
          path: assignment.attachmentPath,
          expiresIn: 900, // 15 minutes
        });
      } catch (err) {
        console.error("Failed to generate signed URL for attachment:", err);
      }
    }

    let safeMySubmission = null;
    if (mySubmission) {
      let downloadUrl: string | null = null;
      if (mySubmission.storagePath) {
        try {
          downloadUrl = await storage.createSignedUrl({
            bucket: ASSIGNMENTS_BUCKET,
            path: mySubmission.storagePath,
            expiresIn: 900, // 15 minutes
          });
        } catch (subErr) {
          console.error("Failed to generate signed URL for student submission:", subErr);
        }
      }
      safeMySubmission = {
        id: mySubmission.id,
        status: mySubmission.status,
        content: mySubmission.content,
        fileName: mySubmission.fileName,
        fileSize: mySubmission.fileSize,
        fileType: mySubmission.fileType,
        submittedAt: mySubmission.submittedAt,
        attemptCount: mySubmission.attemptCount,
        score: mySubmission.score,
        feedback: mySubmission.feedback,
        gradedAt: mySubmission.gradedAt,
        downloadUrl,
      };
    }

    // Return sanitized detail without exposing raw internal storagePath
    const safeAssignment = {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      scheduleId: assignment.scheduleId,
      instructorId: assignment.instructorId,
      dueDate: assignment.dueDate,
      allowLateSubmission: assignment.allowLateSubmission,
      maxScore: assignment.maxScore,
      status: assignment.status,
      attachmentName: assignment.attachmentName,
      attachmentSize: assignment.attachmentSize,
      attachmentType: assignment.attachmentType,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      class: assignment.class,
      subject: assignment.subject,
      schedule: assignment.schedule,
      instructor: assignment.instructor,
    };

    return Response.json(
      {
        data: {
          ...safeAssignment,
          attachmentUrl,
          submissionCount: assignment._count.submissions,
          mySubmission: safeMySubmission,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("GET /api/assignments/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedStoragePath: string | null = null;
  const storage = getStorageProvider();

  try {
    const authenticatedUser = await requirePermission("assignment:update");
    const { id } = await params;

    if (
      authenticatedUser.role !== "SUPER_ADMIN" &&
      authenticatedUser.role !== "ADMIN" &&
      authenticatedUser.role !== "INSTRUCTOR"
    ) {
      throw new ForbiddenError();
    }

    const existingAssignment = await prisma.assignment.findFirst({
      where: { id, deletedAt: null },
      include: {
        class: {
          select: {
            id: true,
            instructorId: true,
            batchId: true,
            batch: { select: { programId: true } },
          },
        },
        submissions: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!existingAssignment) {
      return Response.json({ message: "Assignment not found." }, { status: 404 });
    }

    if (authenticatedUser.role === "INSTRUCTOR") {
      await requireInstructorAssignmentAccess(authenticatedUser, id);
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

    const parsed = assignmentUpdateSchema.safeParse(rawData);
    if (!parsed.success) {
      return Response.json(
        {
          message: "Validation failed.",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updateData: Prisma.AssignmentUpdateInput = {};
    const auditChanges: Record<string, { before: unknown; after: unknown }> = {};

    let targetClassId = existingAssignment.classId;
    let targetSubjectId = existingAssignment.subjectId;

    // 1. Validate class change
    if (parsed.data.classId !== undefined && parsed.data.classId !== existingAssignment.classId) {
      if (existingAssignment.submissions.length > 0) {
        return Response.json(
          {
            message:
              "Tidak dapat memindahkan kelas penugasan karena sudah terdapat pengumpulan dari mahasiswa.",
          },
          { status: 400 }
        );
      }

      const newClass = await prisma.class.findUnique({
        where: {
          id: parsed.data.classId,
          deletedAt: null,
          batch: { deletedAt: null, program: { deletedAt: null } },
          instructor: { deletedAt: null },
        },
        select: {
          id: true,
          instructorId: true,
          batch: { select: { programId: true } },
        },
      });

      if (!newClass) {
        return Response.json({ message: "Class not found." }, { status: 404 });
      }

      if (authenticatedUser.role === "INSTRUCTOR") {
        await requireInstructorClassAccess(authenticatedUser, newClass.id);
      }

      targetClassId = newClass.id;
      updateData.class = { connect: { id: newClass.id } };
      auditChanges.classId = {
        before: existingAssignment.classId,
        after: newClass.id,
      };
    }

    // 2. Validate subject change
    if (parsed.data.subjectId !== undefined) {
      const newSubject = await prisma.subject.findUnique({
        where: { id: parsed.data.subjectId, deletedAt: null },
        select: { id: true },
      });

      if (!newSubject) {
        return Response.json({ message: "Subject not found." }, { status: 404 });
      }

      targetSubjectId = newSubject.id;
      updateData.subject = { connect: { id: newSubject.id } };
      auditChanges.subjectId = {
        before: existingAssignment.subjectId,
        after: newSubject.id,
      };
    }

    // Verify targetSubject is valid for targetClass
    if (parsed.data.classId !== undefined || parsed.data.subjectId !== undefined) {
      const classRecord = await prisma.class.findUnique({
        where: { id: targetClassId },
        select: { batch: { select: { programId: true } } },
      });

      const isSubjectInProgram = await prisma.programSubject.findUnique({
        where: {
          programId_subjectId: {
            programId: classRecord!.batch.programId,
            subjectId: targetSubjectId,
          },
        },
        select: { programId: true },
      });

      const hasScheduleForSubject = await prisma.schedule.findFirst({
        where: {
          classId: targetClassId,
          subjectId: targetSubjectId,
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
    }

    // 3. Validate scheduleId change
    if (parsed.data.scheduleId !== undefined) {
      if (parsed.data.scheduleId === null || parsed.data.scheduleId === "") {
        updateData.schedule = { disconnect: true };
        auditChanges.scheduleId = {
          before: existingAssignment.scheduleId,
          after: null,
        };
      } else {
        const scheduleRecord = await prisma.schedule.findUnique({
          where: { id: parsed.data.scheduleId, deletedAt: null },
          select: { id: true, classId: true, subjectId: true },
        });

        if (!scheduleRecord) {
          return Response.json(
            { message: "Sesi jadwal tidak ditemukan." },
            { status: 404 }
          );
        }

        if (
          scheduleRecord.classId !== targetClassId ||
          scheduleRecord.subjectId !== targetSubjectId
        ) {
          return Response.json(
            {
              message:
                "Sesi jadwal tidak sesuai dengan kelas dan mata kuliah yang dipilih.",
            },
            { status: 400 }
          );
        }

        updateData.schedule = { connect: { id: scheduleRecord.id } };
        auditChanges.scheduleId = {
          before: existingAssignment.scheduleId,
          after: scheduleRecord.id,
        };
      }
    }

    // 4. Update basic fields
    if (parsed.data.title !== undefined) {
      updateData.title = parsed.data.title;
      auditChanges.title = { before: existingAssignment.title, after: parsed.data.title };
    }
    if (parsed.data.description !== undefined) {
      updateData.description = parsed.data.description;
      auditChanges.description = { before: existingAssignment.description, after: parsed.data.description };
    }
    if (parsed.data.dueDate !== undefined) {
      const newDueDate = new Date(parsed.data.dueDate);
      updateData.dueDate = newDueDate;
      auditChanges.dueDate = { before: existingAssignment.dueDate.toISOString(), after: newDueDate.toISOString() };
    }
    if (parsed.data.allowLateSubmission !== undefined) {
      updateData.allowLateSubmission = parsed.data.allowLateSubmission;
      auditChanges.allowLateSubmission = { before: existingAssignment.allowLateSubmission, after: parsed.data.allowLateSubmission };
    }
    if (parsed.data.maxScore !== undefined) {
      updateData.maxScore = parsed.data.maxScore;
      auditChanges.maxScore = { before: existingAssignment.maxScore, after: parsed.data.maxScore };
    }
    if (parsed.data.status !== undefined) {
      updateData.status = parsed.data.status;
      auditChanges.status = { before: existingAssignment.status, after: parsed.data.status };
    }

    // 5. Handle attachment replacement if uploaded
    const oldAttachmentPath = existingAssignment.attachmentPath;

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

      const newAttachmentPath = generateAssignmentInstructionPath(id, safeExt);

      await storage.upload({
        bucket: ASSIGNMENTS_BUCKET,
        path: newAttachmentPath,
        file: fileBuffer,
        contentType: fileBlob.type,
      });
      uploadedStoragePath = newAttachmentPath;

      updateData.attachmentPath = newAttachmentPath;
      updateData.attachmentName = safeFileName;
      updateData.attachmentSize = fileBlob.size;
      updateData.attachmentType = fileBlob.type;

      auditChanges.attachmentName = {
        before: existingAssignment.attachmentName,
        after: safeFileName,
      };
    }

    // 6. Execute update transaction
    let updatedAssignment;
    try {
      updatedAssignment = await prisma.$transaction(async (tx) => {
        const result = await tx.assignment.update({
          where: { id },
          data: updateData,
          include: {
            class: {
              select: {
                id: true,
                name: true,
                batch: { select: { id: true, name: true } },
              },
            },
            subject: { select: { id: true, name: true, code: true } },
            schedule: { select: { id: true, date: true, topic: true } },
            instructor: { select: { id: true, name: true } },
          },
        });

        if (Object.keys(auditChanges).length > 0) {
          await createAuditLog(tx, authenticatedUser, {
            action: "UPDATE",
            entity: "Assignment",
            entityId: id,
            changes: auditChanges,
          });
        }

        return result;
      });
    } catch (dbError) {
      // Compensation: remove newly uploaded file if DB update failed
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

    // Clean up old attachment only after successful database commit
    if (uploadedStoragePath && oldAttachmentPath && oldAttachmentPath !== uploadedStoragePath) {
      try {
        await storage.delete({
          bucket: ASSIGNMENTS_BUCKET,
          path: oldAttachmentPath,
        });
      } catch (cleanupErr) {
        console.warn("Notice: Old attachment cleanup non-fatal warning:", cleanupErr);
      }
    }

    return Response.json({ data: updatedAssignment }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("PATCH /api/assignments/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authenticatedUser = await requirePermission("assignment:delete");
    const { id } = await params;

    const existingAssignment = await prisma.assignment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        classId: true,
      },
    });

    if (!existingAssignment) {
      return Response.json({ message: "Assignment not found." }, { status: 404 });
    }

    const deletedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.assignment.update({
        where: { id },
        data: { deletedAt },
        select: { id: true, deletedAt: true },
      });

      await createAuditLog(tx, authenticatedUser, {
        action: "DELETE",
        entity: "Assignment",
        entityId: id,
        changes: {
          deletedAt: { before: null, after: deletedAt.toISOString() },
          title: existingAssignment.title,
          classId: existingAssignment.classId,
        },
      });

      return deleted;
    });

    return Response.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    console.error("DELETE /api/assignments/[id] error:", error);
    return Response.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
