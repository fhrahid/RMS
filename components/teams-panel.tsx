"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, UserPlus, UserMinus, Crown, UsersRound, Search } from "lucide-react";
import {
  createTeam, renameTeam, deleteTeam, setTeamLeader, addTeamMember, removeTeamMember,
} from "@/app/actions/teams";

interface TeamRow { _id: string; name: string; leaderId: string | null; memberIds: string[] }
interface MemberRow { _id: string; fullName: string; employeeCode: string; role: string; teamId: string | null }

type Result = { error?: string; success?: string } | null | undefined;

export function TeamsPanel({ teams, members }: { teams: TeamRow[]; members: MemberRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState<TeamRow | null>(null);
  const [leading, setLeading] = useState<TeamRow | null>(null);
  const [adding, setAdding] = useState<TeamRow | null>(null);
  const [pickUser, setPickUser] = useState("");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => {
      const leader = members.find((m) => m._id === t.leaderId);
      const memberNames = members
        .filter((m) => m.teamId === t._id)
        .map((m) => `${m.fullName} ${m.employeeCode}`)
        .join(" ");
      return `${t.name} ${leader?.fullName ?? ""} ${leader?.employeeCode ?? ""} ${memberNames}`
        .toLowerCase()
        .includes(q);
    });
  }, [teams, members, query]);

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

  const closeAll = () => {
    setCreating(false); setRenaming(null); setDeleting(null); setLeading(null); setAdding(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search teams, leaders, members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <UsersRound className="h-8 w-8" />
            <p className="text-sm">No teams yet — create the first one.</p>
          </CardContent>
        </Card>
      ) : filteredTeams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Search className="h-8 w-8" />
            <p className="text-sm">No teams match your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredTeams.map((team) => {
            const teamMembers = members.filter((m) => m.teamId === team._id);
            const leader = members.find((m) => m._id === team.leaderId);
            return (
              <Card key={team._id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{team.name}</CardTitle>
                    <Badge variant="secondary">{teamMembers.length} members</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename" onClick={() => setRenaming(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Set leader" onClick={() => { setLeading(team); setPickUser(team.leaderId ?? "(none)"); }}>
                      <Crown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Add member" onClick={() => { setAdding(team); setPickUser(""); }}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" title="Delete team" onClick={() => setDeleting(team)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 text-xs text-muted-foreground">
                    Leader: {leader ? `${leader.fullName} (${leader.employeeCode})` : "unassigned"}
                  </div>
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {teamMembers.map((m) => (
                        <div key={m._id} className="flex items-center justify-between rounded-lg border px-3 py-1.5">
                          <div className="text-sm">
                            {m.fullName}
                            <span className="ml-1.5 font-mono text-xs text-muted-foreground">{m.employeeCode}</span>
                            {m._id === team.leaderId && (
                              <Badge variant="outline" className="ml-2 text-[10px]">LEADER</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            disabled={pending}
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("userId", m._id);
                              busy(fd, removeTeamMember);
                            }}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create team</DialogTitle></DialogHeader>
          <form action={(fd) => busy(fd, createTeam, closeAll)} className="space-y-3">
            <Input name="name" placeholder="Team name (e.g. Alpha)" required autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename “{renaming?.name}”</DialogTitle></DialogHeader>
          <form action={(fd) => busy(fd, renameTeam, closeAll)} className="space-y-3">
            <input type="hidden" name="teamId" value={renaming?._id ?? ""} />
            <Input name="name" defaultValue={renaming?.name} required autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete “{deleting?.name}”?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Members will be unassigned, not deleted.</p>
          <form action={(fd) => busy(fd, deleteTeam, closeAll)} className="flex justify-end gap-2">
            <input type="hidden" name="teamId" value={deleting?._id ?? ""} />
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={pending}>Delete</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Set leader dialog */}
      <Dialog open={!!leading} onOpenChange={(o) => !o && setLeading(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set leader — {leading?.name}</DialogTitle></DialogHeader>
          <form action={(fd) => busy(fd, setTeamLeader, closeAll)} className="space-y-3">
            <input type="hidden" name="teamId" value={leading?._id ?? ""} />
            <input type="hidden" name="userId" value={pickUser} />
            <Select value={pickUser} onValueChange={(v) => setPickUser(v ?? "(none)")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a leader" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="(none)">— No leader —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.fullName} ({m.employeeCode}){m.role === "TEAM_LEADER" ? " ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLeading(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add member — {adding?.name}</DialogTitle></DialogHeader>
          <form action={(fd) => busy(fd, addTeamMember, closeAll)} className="space-y-3">
            <input type="hidden" name="teamId" value={adding?._id ?? ""} />
            <input type="hidden" name="userId" value={pickUser} />
            <Select value={pickUser} onValueChange={(v) => setPickUser(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose an employee" /></SelectTrigger>
              <SelectContent>
                {members.filter((m) => m.teamId !== adding?._id).map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.fullName} ({m.employeeCode}){m.teamId ? " — moves from current team" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
              <Button type="submit" disabled={pending || !pickUser}>Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
