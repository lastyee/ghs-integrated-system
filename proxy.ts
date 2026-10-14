import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((request) => {
  if (!request.auth) {
    if (request.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.nextUrl.origin);
    if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/login") {
      loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/users/:path*",
    "/students/:path*",
    "/programs/:path*",
    "/subjects/:path*",
    "/batches/:path*",
    "/enrollments/:path*",
    "/classes/:path*",
    "/schedules/:path*",
    "/attendance/:path*",
    "/assessments/:path*",
    "/documents/:path*",
    "/employers/:path*",
    "/vacancies/:path*",
    "/applications/:path*",
    "/interviews/:path*",
    "/placements/:path*",
    "/certificates/:path*",
    "/reports/:path*",
  ],
};
