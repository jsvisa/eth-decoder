import { NextResponse } from "next/server";

export function middleware(request) {
  const { searchParams } = request.nextUrl;
  if (searchParams.has("data")) {
    const dest = new URL("/tx-decoder", request.nextUrl.origin);
    dest.search = request.nextUrl.search;
    return NextResponse.redirect(dest);
  }
}

export const config = {
  matcher: "/",
};
