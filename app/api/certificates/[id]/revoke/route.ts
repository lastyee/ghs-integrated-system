import { PATCH as parentPatch } from "../route";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return parentPatch(request, context);
}
