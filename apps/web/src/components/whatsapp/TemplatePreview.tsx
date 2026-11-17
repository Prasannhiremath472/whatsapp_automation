import { Check, CheckCheck, ExternalLink, Image as ImageIcon, Phone, Reply } from "lucide-react";
import { fillPreviewVariables, type WaTemplate } from "./templates-data";

function renderBody(body: string, sample: boolean) {
  const text = sample ? fillPreviewVariables(body) : body;
  return text.split(/(\{\{\d+\}\})/g).map((part, i) =>
    /^\{\{\d+\}\}$/.test(part) ? (
      <mark key={i} className="rounded bg-wa-bright/25 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Renders a template as a WhatsApp-style outgoing message bubble on a chat background. */
export function TemplatePreview({ template, sample = true }: { template: WaTemplate; sample?: boolean }) {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-xl bg-chat-bg p-4">
      <div className="ml-auto w-fit max-w-[85%] overflow-hidden rounded-lg bg-bubble-out shadow-sm">
        {template.headerType === "image" && template.headerMediaUrl && (
          <img src={template.headerMediaUrl} alt="Header" className="max-h-48 w-full object-cover" />
        )}
        {["image", "video", "document"].includes(template.headerType) && !(template.headerType === "image" && template.headerMediaUrl) && (
          <div className="flex h-32 items-center justify-center bg-wa-deep/10">
            <div className="text-center"><ImageIcon className="mx-auto h-8 w-8 text-wa-deep/40" /><p className="mt-2 text-xs text-muted-foreground">{template.headerType} placeholder</p></div>
          </div>
        )}
        <div className="px-3 pb-1.5 pt-2">
          {template.headerType === "text" && template.headerText && (
            <p className="mb-1 text-sm font-semibold text-foreground">
              {renderBody(template.headerText, sample)}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {renderBody(template.body, sample)}
          </p>
          {template.footer && <p className="mt-1 text-xs text-muted-foreground">{template.footer}</p>}
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <span className="text-[10px] text-muted-foreground">{now}</span>
            <CheckCheck className="h-3.5 w-3.5 text-tick-read" />
          </div>
        </div>
        {template.buttons.length > 0 && (
          <div className="divide-y border-t">
            {template.buttons.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-center gap-1.5 bg-card/60 px-3 py-2 text-sm font-medium text-info"
              >
                {b.type === "quick_reply" && <Reply className="h-3.5 w-3.5" />}
                {b.type === "cta_url" && <ExternalLink className="h-3.5 w-3.5" />}
                {b.type === "cta_phone" && <Phone className="h-3.5 w-3.5" />}
                {b.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DeliveryTick({ status }: { status: "sent" | "delivered" | "read" }) {
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  return <CheckCheck className={`h-3.5 w-3.5 ${status === "read" ? "text-tick-read" : "text-muted-foreground"}`} />;
}
