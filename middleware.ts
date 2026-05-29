import { NextRequest, NextResponse } from "next/server";

const localAppPrefixes = ["/dashboard", "/api/"];

export function middleware(request: NextRequest) {
  const marketingOnly = ["1", "true", "yes", "on"].includes(
    (process.env.MARKETING_ONLY || "").toLowerCase()
  );

  if (!marketingOnly) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isLocalAppRoute = localAppPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isLocalAppRoute) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"]
};
