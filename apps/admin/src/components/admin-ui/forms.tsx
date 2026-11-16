import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Field {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "select" | "textarea" | "date" | "switch";
  options?: string[];
  required?: boolean;
  default?: any;
  placeholder?: string;
  half?: boolean;
  min?: number;
}

export function validate(fields: Field[], values: Record<string, any>) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.required && (v === undefined || v === null || String(v).trim() === "")) errors[f.key] = `${f.label} is required`;
    else if (f.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) errors[f.key] = "Enter a valid email";
    else if (f.type === "number" && v !== "" && v !== undefined && v !== null && isNaN(Number(v))) errors[f.key] = "Enter a number";
    else if (f.type === "number" && f.min !== undefined && v !== "" && v !== undefined && v !== null && Number(v) < f.min) errors[f.key] = `Must be at least ${f.min}`;
  }
  return errors;
}

export function FieldInput({ f, value, onChange, error }: { f: Field; value: any; onChange: (v: any) => void; error?: string }) {
  const id = `f-${f.key}`;
  return (
    <div className={f.half ? "col-span-1" : "col-span-2"}>
      {f.type === "switch" ? (
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor={id}>{f.label}</Label>
          <Switch id={id} checked={!!value} onCheckedChange={onChange} />
        </div>
      ) : (
        <>
          <Label htmlFor={id} className="mb-1.5 block text-xs font-medium">
            {f.label} {f.required && <span className="text-destructive">*</span>}
          </Label>
          {f.type === "select" ? (
            <Select value={value ?? ""} onValueChange={onChange}>
              <SelectTrigger id={id}><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger>
              <SelectContent>{f.options!.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          ) : f.type === "textarea" ? (
            <Textarea id={id} value={value ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} rows={4} />
          ) : (
            <Input id={id} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"} value={value ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
          )}
        </>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormDrawer({
  open, onOpenChange, title, description, fields, initial, submitLabel = "Save", onSubmit, children, extraValidate,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; fields: Field[];
  initial?: Record<string, any>; submitLabel?: string; onSubmit: (v: Record<string, any>) => void; children?: ReactNode;
  extraValidate?: (v: Record<string, any>) => Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues({ ...Object.fromEntries(fields.map((f) => [f.key, f.default ?? (f.type === "switch" ? false : "")])), ...initial });
      setErrors({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const errs = { ...validate(fields, values), ...(extraValidate?.(values) ?? {}) };
            setErrors(errs);
            if (Object.keys(errs).length) return;
            onSubmit(values);
            onOpenChange(false);
          }}
        >
          <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-5">
            {children}
            {fields.map((f) => (
              <FieldInput key={f.key} f={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
          </div>
          <SheetFooter className="border-t p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{submitLabel}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, onConfirm,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
