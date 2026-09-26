import { PrismaClient } from "@prisma/client";
import { activateStudentSchema } from "@/schemas/activation";
import { hashPassword } from "@/server/auth/password";
import { createAuditLog } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    // 0. Global IP Abuse Protection Rate Limit (max 30 requests per minute)
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const ipLimit = checkRateLimit(`activate:ip:${ip}`, 30, 60 * 1000);
    if (!ipLimit.allowed) {
      return Response.json(
        { error: "Terlalu banyak permintaan aktivasi dari alamat ini. Silakan coba lagi beberapa saat kemudian." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const parsed = activateStudentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Validasi gagal",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { nim, name, nik, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedName = name.trim();

    // 0b. Targeted NIM Brute-Force Rate Limit (max 8 attempts per NIM per minute)
    const nimLimit = checkRateLimit(`activate:nim:${nim}`, 8, 60 * 1000);
    if (!nimLimit.allowed) {
      return Response.json(
        { error: "Terlalu banyak percobaan aktivasi untuk NIM ini. Silakan coba lagi dalam beberapa menit." },
        { status: 429, headers: { "Retry-After": String(nimLimit.retryAfterSeconds) } }
      );
    }

    // 1. Check if student exists in GHS records
    const student = await prisma.student.findUnique({
      where: { nim },
      select: {
        id: true,
        nim: true,
        nik: true,
        name: true,
        userId: true,
      },
    });

    if (!student) {
      return Response.json(
        { error: "Data mahasiswa dengan NIM tersebut tidak ditemukan." },
        { status: 404 }
      );
    }

    // 2. Prevent duplicate account activation for this student
    if (student.userId) {
      return Response.json(
        { error: "Akun untuk mahasiswa ini sudah aktif. Silakan masuk menggunakan email Anda." },
        { status: 409 }
      );
    }

    // 3. Conservative verification: Verify student identity
    if (student.name.trim().toLowerCase() !== normalizedName.toLowerCase()) {
      return Response.json(
        { error: "Verifikasi gagal: Nama tidak sesuai dengan data pendaftaran mahasiswa." },
        { status: 400 }
      );
    }

    if (student.nik && nik && student.nik.trim() !== nik.trim()) {
      return Response.json(
        { error: "Verifikasi gagal: NIK tidak sesuai dengan data pendaftaran mahasiswa." },
        { status: 400 }
      );
    }

    // 4. Check if email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return Response.json(
        { error: "Email sudah digunakan oleh akun lain." },
        { status: 409 }
      );
    }

    // 5. Fetch STUDENT role (server-authoritative: client cannot dictate role)
    const studentRole = await prisma.role.findUnique({
      where: { name: "STUDENT" },
      select: { id: true, name: true },
    });

    if (!studentRole) {
      return Response.json(
        { error: "Konfigurasi sistem belum lengkap: Peran STUDENT tidak ditemukan." },
        { status: 500 }
      );
    }

    // 6. Atomic interactive transaction
    const passwordHash = await hashPassword(password);

    const newUser = await prisma.$transaction(async (tx) => {
      // Re-verify under transaction lock to prevent concurrent activation race
      const freshStudent = await tx.student.findUnique({
        where: { id: student.id },
        select: { id: true, userId: true, nim: true, name: true, nik: true },
      });

      if (!freshStudent || freshStudent.userId) {
        throw new Error("ALREADY_ACTIVATED");
      }

      const freshUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (freshUser) {
        throw new Error("EMAIL_EXISTS");
      }

      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: freshStudent.name,
          roleId: studentRole.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      // Link User <-> Student (server-determined studentId)
      const studentUpdateData: { userId: string; nik?: string } = {
        userId: createdUser.id,
      };
      if (!freshStudent.nik && nik) {
        studentUpdateData.nik = nik.trim();
      }

      await tx.student.update({
        where: { id: freshStudent.id },
        data: studentUpdateData,
      });

      // Audit Log
      await createAuditLog(
        tx,
        {
          id: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
          role: "STUDENT",
        },
        {
          action: "ACTIVATE_ACCOUNT",
          entity: "Student",
          entityId: freshStudent.id,
          changes: {
            userId: createdUser.id,
            email: createdUser.email,
            nim: freshStudent.nim,
          },
        }
      );

      return createdUser;
    });

    return Response.json(
      {
        success: true,
        message: "Akun berhasil diaktifkan. Silakan masuk.",
        user: newUser,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "ALREADY_ACTIVATED") {
        return Response.json(
          { error: "Akun untuk mahasiswa ini sudah aktif." },
          { status: 409 }
        );
      }
      if (error.message === "EMAIL_EXISTS") {
        return Response.json(
          { error: "Email sudah digunakan oleh akun lain." },
          { status: 409 }
        );
      }
    }

    console.error("Error in POST /api/auth/activate:", error);
    return Response.json(
      { error: "Terjadi kesalahan internal pada server." },
      { status: 500 }
    );
  }
}
