import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/shifts";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export interface Session {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  employeeCode?: string | null;
  teamId?: string | null;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set in .env.local");
  return new TextEncoder().encode(s);
}

export async function createSession(data: Session) {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Read + verify session from cookie. Returns null when signed out. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.userId),
      username: String(payload.username),
      fullName: String(payload.fullName),
      role: payload.role as Role,
      employeeCode: (payload.employeeCode as string) ?? null,
      teamId: (payload.teamId as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRoles(...roles: Role[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.role)) redirect(s.role === "EMPLOYEE" ? "/my-schedule" : "/admin");
  return s;
}
