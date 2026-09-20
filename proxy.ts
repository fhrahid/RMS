import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // Already signed in? Skip the login page.
    const token = req.cookies.get(COOKIE)?.value;
    if (token) {
      try {
        await jwtVerify(token, jwtSecret());
        return NextResponse.redirect(new URL("/", req.url));
      } catch {
        // stale token — fall through to login
      }
    }
    return NextResponse.next();
  }

  // Everything else requires a valid session
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  try {
    await jwtVerify(token, jwtSecret());
    return NextResponse.next();
  } catch {
    const url = new URL("/login", req.url);
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
}

function jwtSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|ico)).*)"],
};
