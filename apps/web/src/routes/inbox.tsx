import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  Send,
  Smile,
  StickyNote,
  Tag,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  conversations as seedConversations,
  type Conversation,
} from "@/components/whatsapp/inbox-data";
import { sampleTemplates } from "@/components/whatsapp/templates-data";
import { DeliveryTick } from "@/components/whatsapp/TemplatePreview";
import {useDemo} from "@/components/genie/DemoProvider";
import {pageHead} from "@/components/genie/head";
import {Choice,Field,Status} from "@/components/genie/ui";
import {toast} from "sonner";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const templateParam = searchParams.get("template");
  const navigate = useNavigate();
  const {data,setData,ready}=useDemo();
  const conversations=data.conversations;
  const templates=data.templates;
  const setConversations=(update:(prev:Conversation[])=>Conversation[])=>setData(d=>({...d,conversations:update(d.conversations)}));
  const attachmentRef=useRef<HTMLInputElement>(null);
  const [note,setNote]=useState("");
  const [tag,setTag]=useState("");
  const [activeId, setActiveId] = useState<string | null>(seedConversations[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [draft, setDraft] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // "Use template" from the Templates page lands here with ?template=<id>
  useEffect(() => {
    if (!templateParam || !ready) return;
    const tpl = templates.find((t) => t.id === templateParam);
    if (tpl) setDraft(tpl.body);
    setSearchParams({}, { replace: true });
  }, [templateParam, navigate, ready, templates]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeId, active?.messages.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(
      (c) =>
        (filter === "all" || filter === "unread" && c.unread > 0 || filter===c.status?.toLowerCase() || filter==="unassigned"&&!c.assignedTo || filter==="assigned to me"&&c.assignedTo==="Admin") &&
        (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.lastMessage.toLowerCase().includes(q)),
    );
  }, [conversations, query, filter]);

  const openConversation = (id: string) => {
    setActiveId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const send = () => {
    const text = draft.trim();
    if (!text || !active) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? {
              ...c,
              lastMessage: text,
              lastTime: time,
              messages: [...c.messages, { id: `m${Date.now()}`, from: "me", text, time, status: "sent" }],
            }
          : c,
      ),
    );
    setDraft("");
  };

  const insertTemplate = (body: string) => {
    setDraft(body);
    setTemplatePickerOpen(false);
  };

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[480px] overflow-hidden rounded-xl border bg-card shadow-card">
      <input hidden ref={attachmentRef} type="file" onChange={e=>{const f=e.target.files?.[0];if(f)setDraft(d=>d+` [Demo attachment: ${f.name}]`);e.target.value="";}}/>
      {/* Conversation list */}
      <aside
        className={cn(
          "w-full flex-col border-r md:flex md:w-60 md:shrink-0 lg:w-64",
          active ? "hidden md:flex" : "flex",
        )}
      >
        <div className="space-y-2.5 border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 bg-chat-bg pl-9"
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "unread", "open", "pending", "resolved", "unassigned", "assigned to me"] as const).map((f) => (
              <Button variant="ghost"
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
                {f === "unread" && (
                  <span className="ml-1.5">{conversations.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0)}</span>
                )}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No conversations found.</p>
          )}
          {visible.map((c) => (
            <Button variant="ghost"
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-none border-b px-3 py-3 text-left transition-colors hover:bg-muted/60",
                c.id === activeId && "bg-primary-soft/50",
              )}
            >
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-wa-teal/15 text-sm font-semibold text-wa-deep">{c.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", c.unread > 0 ? "font-semibold" : "font-medium")}>{c.name}</span>
                  <span className={cn("shrink-0 text-[11px]", c.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {c.lastTime}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("truncate text-xs", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {c.lastMessage}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-bright px-1.5 text-[11px] font-semibold text-wa-deep">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </aside>

      {/* Chat thread */}
      {active ? (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b bg-card px-3 py-2.5">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Back" onClick={() => setActiveId(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-wa-teal/15 text-xs font-semibold text-wa-deep">{active.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{active.name}</p>
              <p className="truncate text-xs text-muted-foreground">{active.phone}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Call" onClick={()=>toast.info("Demo call action — no call placed")}><Phone className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={()=>setConversations(prev=>prev.map(c=>c.id===active.id?{...c,status:c.status==="Resolved"?"Open":"Resolved"}:c))}>{active.status==="Resolved"?"Reopen":"Resolve"}</Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto bg-chat-bg px-4 py-4">
            {active.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm",
                    m.from === "me" ? "rounded-tr-none bg-bubble-out" : "rounded-tl-none bg-card",
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-muted-foreground">{m.time}</span>
                    {m.from === "me" && m.status && <DeliveryTick status={m.status} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t bg-card p-2.5">
            <div className="flex items-end gap-1.5">
              <Button variant="ghost" size="icon" aria-label="Emoji" onClick={()=>setDraft(d=>d+" 😊")}><Smile className="h-5 w-5 text-muted-foreground" /></Button>
              <Button variant="ghost" size="icon" aria-label="Attach" onClick={()=>attachmentRef.current?.click()}><Paperclip className="h-5 w-5 text-muted-foreground" /></Button>
              <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Insert template">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0">
                  <p className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">INSERT TEMPLATE</p>
                  <div className="max-h-72 overflow-y-auto">
                    {templates.map((t) => (
                      <Button variant="ghost"
                        key={t.id}
                        onClick={() => insertTemplate(t.body)}
                        className="h-auto w-full flex-col items-stretch whitespace-normal border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs font-semibold">{t.name}</span>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">{t.category}</Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                className="h-10 flex-1 rounded-full bg-chat-bg"
                placeholder="Type a message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button size="icon" className="h-10 w-10 rounded-full" aria-label="Send" onClick={send} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="hidden flex-1 items-center justify-center bg-chat-bg md:flex">
          <p className="text-sm text-muted-foreground">Select a conversation to start replying.</p>
        </section>
      )}

      {/* Customer details */}
      {active && (
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-l bg-card xl:flex">
          <div className="flex flex-col items-center gap-2 border-b p-5 text-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-wa-teal/15 text-lg font-semibold text-wa-deep">{active.initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{active.name}</p>
              <p className="text-xs text-muted-foreground">{active.phone}</p>
            </div>
            {active.assignedTo && (
              <Badge variant="secondary" className="text-[11px]">Assigned to {active.assignedTo}</Badge>
            )}
          </div>
          <div className="space-y-4 p-4">
            <Status>{active.status??"Open"}</Status>
            <Choice label="Assigned agent / team" value={active.assignedTo??"Unassigned"} options={["Unassigned",...data.members.map(m=>m.name),...data.teams]} onChange={assignedTo=>setConversations(prev=>prev.map(c=>c.id===active.id?{...c,assignedTo:assignedTo==="Unassigned"?"":assignedTo}:c))} />
            <p className="break-all text-xs text-muted-foreground">{active.email}</p>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> TAGS
              </p>
              <div className="flex flex-wrap gap-1.5">
                {active.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                ))}
              </div>
              <div className="mt-2 flex gap-1"><Input aria-label="New contact tag" placeholder="Add label" value={tag} onChange={e=>setTag(e.target.value)}/><Button variant="outline" size="sm" disabled={!tag.trim()} onClick={()=>{setConversations(prev=>prev.map(c=>c.id===active.id?{...c,tags:[...new Set([...c.tags,tag.trim()])]}:c));setTag("");}}>Add</Button></div>
            </div>
            <Separator />
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" /> NOTES
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{active.notes}</p>
              <Input className="mt-3" aria-label="Internal note" placeholder="Add internal note" value={note} onChange={e=>setNote(e.target.value)}/>
              <Button className="mt-2" variant="outline" size="sm" disabled={!note.trim()} onClick={()=>{setConversations(prev=>prev.map(c=>c.id===active.id?{...c,notes:c.notes+"\n"+note.trim()}:c));setNote("");}}>Save note</Button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
