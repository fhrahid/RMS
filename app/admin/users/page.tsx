import { connectDB } from "@/lib/mongodb";
import { UserModel, TeamModel } from "@/models";
import { requireRoles } from "@/lib/auth";
import { UsersPanel } from "@/components/users-panel";

export default async function UsersPage() {
  await requireRoles("ADMIN");
  await connectDB();

  const users = await UserModel().find().sort({ fullName: 1 }).populate<{ team: { name: string } | null }>("team", "name");
  const teams = await TeamModel().find().sort({ name: 1 });

  const rows = users.map((u) => ({
    _id: String(u._id),
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    employeeCode: u.employeeCode ?? "",
    teamId: u.team ? String(u.team) : null,
    teamName: (u.team as { name: string } | null)?.name ?? "",
    active: u.active,
  }));

  const teamRows = teams.map((t) => ({ _id: String(t._id), name: t.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage accounts and roles. Passwords are stored bcrypt-hashed.
        </p>
      </div>
      <UsersPanel users={rows} teams={teamRows} />
    </div>
  );
}
