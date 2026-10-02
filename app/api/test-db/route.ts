import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const count = await prisma.batch.count({
      where: { deletedAt: null }
    });
    return Response.json({ success: true, count });
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
