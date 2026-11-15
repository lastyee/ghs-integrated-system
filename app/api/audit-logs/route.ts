import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";

const prisma = new PrismaClient();
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function sanitizeAuditChanges(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") {
    if (typeof val === "string") {
      if (/^(postgres(ql)?:\/\/|Bearer\s+|eyJ[a-zA-Z0-9_-]{10,}|\$2[aby]\$)/i.test(val)) {
        return "[REDACTED]";
      }
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeAuditChanges);
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (
      /password|token|secret|session|database[_-]?url|storage[_-]?path|raw[_-]?path|binary|cookie/i.test(
        k,
      )
    ) {
      continue;
    }
    clean[k] = sanitizeAuditChanges(v);
  }
  return clean;
}

function formatAuditSummary(
  action: string,
  entity: string,
  changes: unknown,
  entityId: string,
): string {
  if (!changes || typeof changes !== "object") {
    return `Aksi ${action} pada ${entity}`;
  }

  const raw = changes as Record<string, unknown>;
  const payload =
    raw.fields && typeof raw.fields === "object"
      ? (raw.fields as Record<string, unknown>)
      : raw;

  if (entity === "AssignmentSubmission") {
    if (action === "GRADE") {
      const scoreObj = payload.score as Record<string, unknown> | number | undefined;
      const score =
        typeof scoreObj === "object" && scoreObj !== null
          ? (scoreObj.after ?? scoreObj.before ?? "-")
          : (scoreObj ?? "-");
      const statusObj = payload.status as Record<string, unknown> | string | undefined;
      const status =
        typeof statusObj === "object" && statusObj !== null
          ? (statusObj.after ?? "GRADED")
          : (statusObj ?? "GRADED");
      return `Penilaian tugas (Skor: ${score}, Status: ${status})`;
    }
    if (action === "CREATE") {
      const fileName = payload.fileName ?? "berkas tugas";
      return `Pengumpulan tugas (${fileName})`;
    }
  }

  if (entity === "Assignment") {
    if (action === "CREATE") {
      const title = payload.title ?? entityId;
      return `Pembuatan tugas baru: "${title}"`;
    }
    if (action === "UPDATE") {
      return `Pembaruan data tugas ${payload.title ? `"${payload.title}"` : ""}`.trim();
    }
  }

  if (entity === "Document") {
    if (action === "UPLOAD") {
      const docType = payload.type ?? "Dokumen";
      const fileName = payload.fileName ?? "";
      return `Unggah berkas ${docType}${fileName ? ` (${fileName})` : ""}`;
    }
    if (action === "VERIFY") {
      const status = payload.status ?? "Diverifikasi";
      return `Verifikasi dokumen: Status ${status}`;
    }
  }

  if (entity === "Attendance") {
    if (action === "CREATE") return "Pencatatan sesi kehadiran kelas";
    if (action === "UPDATE") return "Pembaruan catatan presensi siswa";
  }

  if (entity === "Assessment") {
    if (action === "CREATE") {
      const name = payload.name ?? entityId;
      return `Pembuatan sesi asesmen: "${name}"`;
    }
  }

  if (entity === "AssessmentScore") {
    const scoreObj = payload.score as Record<string, unknown> | number | undefined;
    const score =
      payload.after ??
      (typeof scoreObj === "object" && scoreObj !== null
        ? (scoreObj.after ?? "-")
        : (scoreObj ?? "-"));
    return `Pencatatan nilai asesmen: ${score}`;
  }

  if (entity === "Student") {
    if (action === "ACTIVATE_ACCOUNT") {
      const nim = payload.nim ?? "";
      return `Aktivasi akun mahasiswa${nim ? ` (NIM: ${nim})` : ""}`;
    }
    if (action === "CREATE") {
      const name = payload.name ?? entityId;
      return `Pendaftaran mahasiswa baru: ${name}`;
    }
    if (action === "UPDATE") {
      return "Pembaruan data profil mahasiswa";
    }
  }

  if (entity === "User") {
    if (action === "CREATE") {
      const email = payload.email ?? "";
      const role = payload.role ?? "";
      return `Pembuatan akun pengguna: ${email}${role ? ` (${role})` : ""}`;
    }
    if (action === "DELETE") return "Penonaktifan akun pengguna";
  }

  if (entity === "Schedule") {
    if (action === "CREATE") return "Pembuatan jadwal sesi kelas baru";
    if (action === "UPDATE") return "Pembaruan jadwal sesi kelas";
  }

  if (entity === "Class" && action === "CREATE") {
    return `Pembuatan kelas: "${payload.name ?? entityId}"`;
  }

  if (entity === "Batch" && action === "CREATE") {
    return `Pembuatan batch: "${payload.name ?? entityId}"`;
  }

  if (entity === "Program" && action === "CREATE") {
    return `Pembuatan program studi: "${payload.name ?? entityId}"`;
  }

  if (entity === "Subject" && action === "CREATE") {
    return `Pembuatan mata pelajaran: "${payload.name ?? entityId}"`;
  }

  if (entity === "Employer" && action === "CREATE") {
    return `Pendaftaran perusahaan mitra: "${payload.name ?? entityId}"`;
  }

  if (entity === "Vacancy" && action === "CREATE") {
    return `Publikasi lowongan kerja: "${payload.title ?? entityId}"`;
  }

  if (entity === "Application" && action === "CREATE") {
    return "Pengajuan lamaran lowongan kerja";
  }

  if (entity === "Interview" && action === "CREATE") {
    return `Penjadwalan wawancara${payload.method ? ` (${payload.method})` : ""}`;
  }

  if (entity === "Placement" && action === "CREATE") {
    return `Pencatatan penempatan kerja${payload.position ? ` (${payload.position})` : ""}`;
  }

  if (action === "DELETE") {
    return `Penghapusan data ${entity}`;
  }

  return `Aksi ${action} pada ${entity}`;
}

export async function GET(request: Request) {
  try {
    await requirePermission("audit:read");

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    const cursor = searchParams.get("cursor") || undefined;
    const pageStr = searchParams.get("page");
    const action = searchParams.get("action")?.trim() || undefined;
    const entity = searchParams.get("entity")?.trim() || undefined;
    const search = searchParams.get("search")?.trim() || undefined;
    const startDate = searchParams.get("startDate")?.trim() || undefined;
    const endDate = searchParams.get("endDate")?.trim() || undefined;
    const userId = searchParams.get("userId")?.trim() || undefined;

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return Response.json(
        { error: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.` },
        { status: 400 },
      );
    }

    let page: number | undefined;
    if (pageStr !== null && pageStr !== undefined) {
      page = Number(pageStr);
      if (!Number.isInteger(page) || page < 1) {
        return Response.json(
          { error: "page must be a positive integer." },
          { status: 400 },
        );
      }
    }

    if (cursor) {
      const cursorExists = await prisma.auditLog.findUnique({
        where: { id: cursor },
        select: { id: true },
      });
      if (!cursorExists) {
        return Response.json({ error: "Invalid audit log cursor." }, { status: 400 });
      }
    }

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return Response.json({ error: "Format startDate tidak valid." }, { status: 400 });
        }
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return Response.json({ error: "Format endDate tidak valid." }, { status: 400 });
        }
        if (endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { entityId: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const totalCount = await prisma.auditLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    let rows;
    if (page !== undefined && !cursor) {
      const skip = (page - 1) * limit;
      rows = await prisma.auditLog.findMany({
        skip,
        take: limit,
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          changes: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } else {
      rows = await prisma.auditLog.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          changes: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }

    const hasMore = page !== undefined && !cursor
      ? page < totalPages
      : rows.length > limit;

    const returnRows = page !== undefined && !cursor ? rows : rows.slice(0, limit);

    const data = returnRows.map(({ user, changes, ...entry }) => {
      const sanitized = sanitizeAuditChanges(changes);
      const summary = formatAuditSummary(entry.action, entry.entity, sanitized, entry.entityId);
      return {
        ...entry,
        actor: user,
        summary,
        details: sanitized ?? {},
        changes: sanitized ?? {},
      };
    });

    return Response.json({
      data,
      pageInfo: {
        limit,
        hasMore,
        nextCursor: hasMore ? data.at(-1)?.id ?? null : null,
        page: page ?? 1,
        totalPages,
        totalCount,
      },
      meta: {
        availableActions: [
          "CREATE",
          "UPDATE",
          "DELETE",
          "GRADE",
          "UPLOAD",
          "VERIFY",
          "ACTIVATE_ACCOUNT",
        ],
        availableEntities: [
          "Student",
          "AssignmentSubmission",
          "Assessment",
          "Attendance",
          "AssessmentScore",
          "Assignment",
          "Employer",
          "Vacancy",
          "Program",
          "Schedule",
          "Class",
          "Batch",
          "Enrollment",
          "Document",
          "Subject",
          "Placement",
          "Application",
          "Interview",
          "User",
        ],
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to read audit logs", error);
    return Response.json({ error: "Unable to load audit logs" }, { status: 500 });
  }
}
