"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { createUser, updateUser, resetPassword } from "@/app/actions/users";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/shifts";

interface UserRow {
  _id: string; username: string; fullName: string; role: string;
  employeeCode: string; teamId: string | null; teamName: string; active: boolean;
}
interface TeamRow { _id: string; name: string }

type Result = { error?: string; success?: string } | null | undefined;

export function UsersPanel({ users, teams }: { users: UserRow[]; teams: TeamRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<Role>("EMPLOYEE");
  const [editTeam, setEditTeam] = useState("(none)");
  const [editActive, setEditActive] = useState(true);
  const [createRole, setCreateRole] = useState<Role>("EMPLOYEE");
  const [createTeam, setCreateTeam] = useState("(none)");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<Result>, close?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      if (res?.success) {
        toast.success(res.success);
        close?.();
        router.refresh();
      }
    });
  }
  const busy = (fd: FormData, action: (a: never, f: FormData) => Promise<Result>, close?: () => void) =>
    run(() => action({} as never, fd), close);
  const closeAll = () => { setCreating(false); setEditing(null); setResetting(null); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setCreateRole("EMPLOYEE"); setCreateTeam("(none)"); setCreating(true); }}>
          <UserPlus className="h-4 w-4" /> New User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium">{u.fullName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">@{u.username}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="gap-1">
                        {u.role === "ADMIN" ? <ShieldCheck className="h-3 w-3 text-primary" /> : u.role === "EMPLOYEE" ? <ShieldAlert className="h-3 w-3 text-muted-foreground" /> : null}
                        {ROLE_LABEL[u.role as Role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{u.employeeCode || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.teamName || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={u.active ? "secondary" : "outline"}>
                        {u.active ? "Active" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditing(u); setEditRole(u.role as Role);
                          setEditTeam(u.teamId ?? "(none)"); setEditActive(u.active);
                        }}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create user */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Employees sign in with their SLL- code as username.</DialogDescription>
          </DialogHeader>
          <form action={(fd) => busy(fd, createUser, closeAll)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-fullName">Full name</Label>
              <Input id="c-fullName" name="fullName" required minLength={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-username">Username</Label>
                <Input id="c-username" name="username" required minLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-password">Password</Label>
                <Input id="c-password" name="password" required minLength={4} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <input type="hidden" name="role" value={createRole} />
                <Select value={createRole} onValueChange={(v) => v && setCreateRole(v as Role)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-code">Employee code</Label>
                <Input id="c-code" name="employeeCode" placeholder="SLL-12345" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Team (employees / leaders)</Label>
              <input type="hidden" name="teamId" value={createTeam} />
              <Select value={createTeam} onValueChange={(v) => setCreateTeam(v ?? "(none)")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="(none)">— No team —</SelectItem>
                  {teams.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.fullName}</DialogTitle>
          </DialogHeader>
          <form action={(fd) => busy(fd, updateUser, closeAll)} className="space-y-3">
            <input type="hidden" name="userId" value={editing?._id ?? ""} />
            <div className="space-y-1.5">
              <Label htmlFor="e-fullName">Full name</Label>
              <Input id="e-fullName" name="fullName" defaultValue={editing?.fullName} required minLength={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <input type="hidden" name="role" value={editRole} />
                <Select value={editRole} onValueChange={(v) => v && setEditRole(v as Role)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-code">Employee code</Label>
                <Input id="e-code" name="employeeCode" defaultValue={editing?.employeeCode} placeholder="SLL-12345" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <input type="hidden" name="teamId" value={editTeam} />
              <Select value={editTeam} onValueChange={(v) => setEditTeam(v ?? "(none)")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="(none)">— No team —</SelectItem>
                  {teams.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="hidden" name="active" value={editActive ? "on" : "off"} />
              <Switch id="e-active" checked={editActive} onCheckedChange={(c) => setEditActive(!!c)} />
              <Label htmlFor="e-active">Active (can sign in)</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password — {resetting?.username}</DialogTitle>
          </DialogHeader>
          <form action={(fd) => busy(fd, resetPassword, closeAll)} className="space-y-3">
            <input type="hidden" name="userId" value={resetting?._id ?? ""} />
            <div className="space-y-1.5">
              <Label htmlFor="r-password">New password</Label>
              <Input id="r-password" name="password" required minLength={4} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetting(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Reset</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
