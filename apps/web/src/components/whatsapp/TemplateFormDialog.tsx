import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Variable } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAX_TEMPLATE_BUTTONS,
  templateCategories,
  templateLanguages,
  type TemplateButton,
  type WaTemplate,
} from "./templates-data";
import { ImageUploadField } from "./ImageUploadField";
import { TemplatePreview } from "./TemplatePreview";

type Draft = Omit<WaTemplate, "id" | "status" | "updatedAt">;

const emptyDraft: Draft = {
  name: "",
  category: "Welcome",
  language: "English",
  headerType: "none",
  headerText: "",
  body: "",
  footer: "",
  buttons: [],
};

export function TemplateFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: WaTemplate | null;
  /** Resolve true when saved (the dialog then closes); false keeps it open for corrections. */
  onSave: (draft: Draft, id?: string) => Promise<boolean> | boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [variableCount, setVariableCount] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _id, status: _s, updatedAt: _u, ...rest } = initial;
        setDraft({ ...emptyDraft, ...rest });
      } else {
        setDraft(emptyDraft);
      }
      setVariableCount(initial ? Math.max(0, ...[...initial.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))) : 0);
    }
  }, [open, initial]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const insertVariable = () => {
    const next = variableCount + 1;
    setVariableCount(next);
    const el = bodyRef.current;
    const token = `{{${next}}}`;
    if (el) {
      const start = el.selectionStart ?? draft.body.length;
      const end = el.selectionEnd ?? draft.body.length;
      const body = draft.body.slice(0, start) + token + draft.body.slice(end);
      set("body", body);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      set("body", draft.body + token);
    }
  };

  const setButton = (i: number, patch: Partial<TemplateButton>) =>
    set("buttons", draft.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const preview: WaTemplate = {
    ...draft,
    id: initial?.id ?? "preview",
    status: "draft",
    updatedAt: "now",
    body: draft.body || "Start typing your message…",
  };

  const valid = draft.name.trim() && draft.body.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit template draft" : "Create template"}</DialogTitle>
          <DialogDescription>
            Saved as a draft. Submit it for WhatsApp approval from the templates list when it is ready.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  placeholder="e.g. order_confirmation"
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={draft.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={draft.language} onValueChange={(v) => set("language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateLanguages.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Header</Label>
                <Select
                  value={draft.headerType}
                  onValueChange={(v) => set("headerType", v as Draft["headerType"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video placeholder</SelectItem>
                    <SelectItem value="document">Document placeholder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draft.headerType === "text" && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-header">Header text</Label>
                <Input
                  id="tpl-header"
                  placeholder="e.g. Your order is on its way"
                  value={draft.headerText ?? ""}
                  onChange={(e) => set("headerText", e.target.value)}
                />
              </div>
            )}

            {draft.headerType === "image" && (
              <ImageUploadField
                label="Header image"
                value={draft.headerMediaUrl ?? ""}
                onChange={(url) => set("headerMediaUrl", url)}
                hint="Meta reviews this image together with your template. Campaigns can still use a different picture."
              />
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Message body</Label>
                <Button type="button" variant="outline" size="sm" onClick={insertVariable}>
                  <Variable className="h-3.5 w-3.5" /> Insert variable
                </Button>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                rows={6}
                placeholder="Hi {{1}}, your order #{{2}}…"
                value={draft.body}
                onChange={(e) => set("body", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"}… as placeholders for customer-specific values.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-footer">Footer (optional)</Label>
              <Input
                id="tpl-footer"
                placeholder="e.g. Reply STOP to opt out"
                value={draft.footer ?? ""}
                onChange={(e) => set("footer", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Buttons</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={draft.buttons.length >= MAX_TEMPLATE_BUTTONS}
                  onClick={() => set("buttons", [...draft.buttons, { type: "quick_reply", label: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add button
                </Button>
              </div>
              {draft.buttons.length === 0 && (
                <p className="text-xs text-muted-foreground">No buttons. Add up to 3 quick replies or call-to-actions.</p>
              )}
              {draft.buttons.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={b.type} onValueChange={(v) => setButton(i, { type: v as TemplateButton["type"] })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quick_reply">Quick reply</SelectItem>
                      <SelectItem value="cta_url">Visit website</SelectItem>
                      <SelectItem value="cta_phone">Call number</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Button label"
                    value={b.label}
                    onChange={(e) => setButton(i, { label: e.target.value })}
                  />
                  {b.type !== "quick_reply" && (
                    <Input
                      placeholder={b.type === "cta_url" ? "https://…" : "+91…"}
                      value={b.value ?? ""}
                      onChange={(e) => setButton(i, { value: e.target.value })}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove button"
                    onClick={() => set("buttons", draft.buttons.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Live preview</Label>
            <TemplatePreview template={preview} sample={false} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (await onSave(draft, initial?.id)) onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Save as draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
