import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell
      user={{
        fullName: session.fullName,
        username: session.username,
        role: session.role,
        employeeCode: session.employeeCode,
      }}
    >
      {children}
    </AppShell>
  );
}
