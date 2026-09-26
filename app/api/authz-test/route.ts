import {
  authorizationErrorResponse,
  requirePermission,
} from "@/lib/authorization";

const POC_PERMISSION = "student:create";

export async function GET() {
  try {
    await requirePermission(POC_PERMISSION);

    return Response.json({
      ok: true,
      authorized: true,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
