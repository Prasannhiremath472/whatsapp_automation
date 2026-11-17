import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { imageProblem, useUploadImage } from "@/api/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";

/**
 * Header-image picker: upload a JPG/PNG from the device (stored by the API and
 * turned into a public link for WhatsApp), or paste an existing https link.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadImage();
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    upload.mutate(file, {
      onSuccess: (asset) => onChange(asset.url),
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : "Upload failed. Try again."),
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={fileRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ""; // allow choosing the same file again
        }}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-2">
          <img src={value} alt="Selected header" className="h-16 w-16 shrink-0 rounded object-cover" />
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={value}>
            {value}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? "Uploading…" : "Replace"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove image"
            onClick={() => onChange("")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
        >
          {upload.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="font-medium">{upload.isPending ? "Uploading…" : "Upload image"}</span>
          <span className="text-xs">JPG or PNG, up to 5 MB</span>
        </button>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        className="text-xs text-primary underline"
        onClick={() => setShowLink((v) => !v)}
      >
        {showLink ? "Hide link field" : "Or paste an image link instead"}
      </button>
      {showLink && (
        <Input
          aria-label={`${label} link`}
          inputMode="url"
          placeholder="https://example.com/offer.jpg"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
