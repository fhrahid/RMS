import { connectDB } from "@/lib/mongodb";
import { AuditLogModel } from "@/models";
import { requireRoles } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

const ACTION_COLOR: Record<string, string> = {
  user: "bg-amber-50 text-amber-700 border-amber-200",
  team: "bg-cyan-50 text-cyan-700 border-cyan-200",
  request: "bg-violet-50 text-violet-700 border-violet-200",
  roster: "bg-blue-50 text-blue-700 border-blue-200",
  system: "bg-muted text-muted-foreground",
};

function actionStyle(action: string): string {
  const prefix = action.split(".")[0];
  return ACTION_COLOR[prefix] ?? "bg-muted text-muted-foreground";
}

export default async function AuditPage() {
  await requireRoles("ADMIN");
  await connectDB();

  const logs = await AuditLogModel().find().sort({ createdAt: -1 }).limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Audit Log
          <Badge variant="secondary">{logs.length}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Every roster edit, approval, and user management action is recorded here (latest 200).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" /> Activity
          </CardTitle>
          <CardDescription>
            Colors: blue = roster · violet = requests · amber = users · cyan = teams.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ScrollText className="h-8 w-8" />
              <p className="text-sm">No audit events yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs as unknown as {
                    _id: string; actorName: string; action: string;
                    target: string; details: string; createdAt: Date;
                  }[]).map((log) => (
                    <tr key={log._id} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{log.actorName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`font-mono text-[10px] ${actionStyle(log.action)}`}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">{log.target}</td>
                      <td className="max-w-[320px] truncate px-4 py-2.5 text-muted-foreground">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
