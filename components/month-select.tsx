"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { monthLabel } from "@/lib/shifts";

/** Month dropdown that navigates to `basePath?month=YYYY-MM`. */
export function MonthSelect({
  months, selected, basePath,
}: {
  months: string[];
  selected: string;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v) startTransition(() => router.push(`${basePath}?month=${v}`));
        }}
        disabled={pending}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {monthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
