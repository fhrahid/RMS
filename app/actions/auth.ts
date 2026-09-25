"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel, AuditLogModel, type UserDoc } from "@/models";
import { createSession, destroySession, getSession, type Session } from "@/lib/auth";
import type { Role } from "@/lib/shifts";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function login(_prev: unknown, formData: FormData): Promise<{ error?: string; success?: string }> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await UserModel().findOne({
    username: parsed.data.username.toLowerCase().trim(),
    active: true,
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid username or password" };
  }

  await logAudit(user, "auth.login", user.username, "Signed in");

  await createSession({
    userId: String(user._id),
    username: user.username,
    fullName: user.fullName,
    role: user.role as Role,
    employeeCode: user.employeeCode ?? null,
    teamId: user.team ? String(user.team) : null,
  });

  redirect("/");
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await logAudit(session, "auth.logout", session.username, "Signed out");
  }
  await destroySession();
  redirect("/login");
}

export async function logAudit(
  actor: Session | UserDoc | { _id: { toString(): string }; fullName: string },
  action: string,
  target = "",
  details = ""
) {
  const userId = "_id" in actor ? String(actor._id) : actor.userId;
  const actorName = "fullName" in actor ? actor.fullName : "";
  await AuditLogModel().create({ actor: userId, actorName, action, target, details });
}

export async function assertRoles(roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s || !roles.includes(s.role)) throw new Error("Not authorized");
  return s;
}
