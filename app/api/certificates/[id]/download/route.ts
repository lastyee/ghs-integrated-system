import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requirePermission,
} from "@/lib/authorization";
import {
  CERTIFICATES_BUCKET,
  getStorageProvider,
} from "@/lib/storage";

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authenticatedUser = await requirePermission("certificate:read");
    const { id } = await params;

    const certificate = await prisma.certificate.findFirst({
      where: {
        id,
        deletedAt: null,
        student: { deletedAt: null },
        program: { deletedAt: null },
        batch: { deletedAt: null },
      },
      select: {
        id: true,
        studentId: true,
        certificateNumber: true,
        status: true,
        path: true,
        student: {
          select: {
            id: true,
            nim: true,
            name: true,
            userId: true,
          },
        },
      },
    });

    if (!certificate) {
      return Response.json({ error: "Certificate not found" }, { status: 404 });
    }

    if (authenticatedUser.role === "STUDENT") {
      if (certificate.student.userId !== authenticatedUser.id) {
        throw new ForbiddenError("Access to this certificate download is denied");
      }
    }

    if (!certificate.path) {
      return Response.json(
        { error: "Certificate file is not available" },
        { status: 400 },
      );
    }

    const storage = getStorageProvider();
    const signedUrl = await storage.createSignedUrl({
      bucket: CERTIFICATES_BUCKET,
      path: certificate.path,
      expiresIn: 900,
    });

    return Response.json({
      data: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        signedUrl,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to generate download URL for certificate", error);
    return Response.json(
      { error: "Unable to generate certificate download link" },
      { status: 500 },
    );
  }
}
