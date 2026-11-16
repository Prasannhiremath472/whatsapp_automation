import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCollection } from "@/lib/admin/store";
import { db, SupportService } from "@/services/admin";
import { dateTime } from "@/lib/admin/format";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/admin-layout/useCan";

export function TicketThread({ ticketId }: { ticketId: string }) {
  const t = useCollection(db.tickets).find((x) => x.id === ticketId);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const canManage = useCan("support", "manage");
  if (!t) return null;
  return (
    <div className="space-y-3 pt-2">
      {t.thread.map((m: any, i: number) => (
        <div key={i} className={cn("max-w-[85%] rounded-lg p-3 text-sm", m.from === "client" ? "bg-muted" : m.from === "internal" ? "ml-auto border border-dashed border-warning bg-warning/10" : "ml-auto bg-accent")}>
          <p className="text-foreground">{m.text}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{m.from === "internal" ? "Internal note · " : ""}{m.by} · {dateTime(m.at)}</p>
        </div>
      ))}
      {!canManage ? <p className="text-xs text-muted-foreground">Read-only for your role.</p> : <div className="rounded-lg border p-3">
        <div className="mb-2 flex gap-1">
          <Button size="sm" variant={internal ? "ghost" : "secondary"} onClick={() => setInternal(false)}>Reply to client</Button>
          <Button size="sm" variant={internal ? "secondary" : "ghost"} onClick={() => setInternal(true)}>Internal note</Button>
        </div>
        <Textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder={internal ? "Visible to Genie staff only…" : "Write a reply… (demo — not actually sent)"} />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!text.trim()} onClick={() => { SupportService.reply(t.id, text.trim(), internal); setText(""); toast.success(internal ? "Internal note added" : "Reply added to thread (demo)"); }}>
            {internal ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>}
    </div>
  );
}
