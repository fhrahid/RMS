"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarClock, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { login } from "@/app/actions/auth";
import type { ActionState } from "@/app/actions/shared";

const initial: ActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <CalendarClock className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Roster MS</h1>
          <p className="text-sm text-muted-foreground">Employee Roster Management System</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Use your company credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="e.g. admin or SLL-10001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
              {state.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <Alert className="border-primary/20 bg-primary/5">
                <KeyRound className="h-4 w-4 text-primary" />
                <AlertDescription className="text-xs">
                  Demo accounts — password <code className="rounded bg-muted px-1 font-mono">demo123</code>:
                  <span className="mt-1 block font-mono text-[11px]">
                    admin · manager · sll-10001 (leader) · sll-20001 (employee)
                  </span>
                </AlertDescription>
              </Alert>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground">
              Employees sign in with their SLL- code
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
