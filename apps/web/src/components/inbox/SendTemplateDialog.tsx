import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fillVariables, variableCount } from "@whatsapp-crm/shared-types";
import { useSendTemplate } from "@/api/inbox";
import { toWaTemplate, useApprovedTemplates } from "@/api/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/genie/ui";
import { headerVariableCount } from "@/components/genie/campaign-helpers";
import { ImageUploadField } from "@/components/whatsapp/ImageUploadField";
import { TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { ApiError } from "@/lib/api";

/**
 * Replies to a customer with an approved template. This is the only kind of
 * message WhatsApp allows once the 24-hour window since their last message
 * has closed.
 */
export function SendTemplateDialog({
  open,
  onOpenChange,
  conversationId,
  customerName,
  initialTemplateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  customerName: string;
  initialTemplateId?: string | null;
}) {
  const templatesQuery = useApprovedTemplates();
  const send = useSendTemplate(conversationId);
  const templates = templatesQuery.data ?? [];

  const [templateId, setTemplateId] = useState("");
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [headerVars, setHeaderVars] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");

  const template = templates.find((t) => t.id === templateId);
  const bodyCount = template ? variableCount(template.body) : 0;
  const headerCount = headerVariableCount(template);
  const needsMedia = !!template && ["image", "video", "document"].includes(template.headerType);

  useEffect(() => {
    if (open) setTemplateId(initialTemplateId ?? "");
  }, [open, initialTemplateId]);

  // Fresh inputs whenever the chosen template changes.
  useEffect(() => {
    setBodyVars(Array.from({ length: bodyCount }, () => ""));
    setHeaderVars(Array.from({ length: headerCount }, () => ""));
    setMediaUrl(template?.headerMediaUrl ?? "");
  }, [template?.id, bodyCount, headerCount, template?.headerMediaUrl]);

  const preview = useMemo(() => {
    if (!template) return null;
    const show = (vars: string[]) => vars.map((v, i) => v.trim() || `{{${i + 1}}}`);
    const wa = toWaTemplate(template);
    return {
      ...wa,
      body: fillVariables(template.body, show(bodyVars)),
      ...(wa.headerText ? { headerText: fillVariables(wa.headerText, show(headerVars)) } : {}),
      ...(mediaUrl ? { headerMediaUrl: mediaUrl } : {}),
    };
  }, [template, bodyVars, headerVars, mediaUrl]);

  const ready =
    !!template &&
    bodyVars.every((v) => v.trim()) &&
    headerVars.every((v) => v.trim()) &&
    (!needsMedia || /^https:\/\/\S+$/.test(mediaUrl.trim()));

  const submit = () => {
    if (!template || !ready) return;
    send.mutate(
      {
        templateId: template.id,
        bodyVars: bodyVars.map((v) => v.trim()),
        headerVars: headerVars.map((v) => v.trim()),
        ...(needsMedia ? { headerMediaUrl: mediaUrl.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`Template sent to ${customerName}`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not send the template"),
      },
    );
  };

  const setAt = (list: string[], set: (v: string[]) => void, i: number, value: string) =>
    set(list.map((v, j) => (j === i ? value : v)));

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Send a template"
      description="WhatsApp only allows approved templates outside the 24-hour reply window."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inbox-template">Template</Label>
          <select
            id="inbox-template"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{templatesQuery.isPending ? "Loading…" : "Choose a template"}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          {!templatesQuery.isPending && templates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You have no approved templates yet. Create one on the Message Templates page.
            </p>
          )}
        </div>

        {template && (
          <>
            {headerVars.map((v, i) => (
              <div key={`h${i}`} className="space-y-1.5">
                <Label htmlFor={`hv${i}`}>Header value</Label>
                <Input id={`hv${i}`} value={v} onChange={(e) => setAt(headerVars, setHeaderVars, i, e.target.value)} />
              </div>
            ))}
            {bodyVars.map((v, i) => (
              <div key={`b${i}`} className="space-y-1.5">
                <Label htmlFor={`bv${i}`}>{`Value for {{${i + 1}}}`}</Label>
                <Input
                  id={`bv${i}`}
                  placeholder={i === 0 ? `e.g. ${customerName}` : ""}
                  value={v}
                  onChange={(e) => setAt(bodyVars, setBodyVars, i, e.target.value)}
                />
              </div>
            ))}
            {needsMedia && template.headerType === "image" && (
              <ImageUploadField label="Header image" value={mediaUrl} onChange={setMediaUrl} />
            )}
            {needsMedia && template.headerType !== "image" && (
              <div className="space-y-1.5">
                <Label htmlFor="media-url">{`${template.headerType} link (https)`}</Label>
                <Input id="media-url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
              </div>
            )}
            {preview && <TemplatePreview template={preview} sample={false} />}
          </>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || send.isPending}>
            {send.isPending ? "Sending…" : "Send template"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
