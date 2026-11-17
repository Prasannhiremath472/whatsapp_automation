import { useMutation } from "@tanstack/react-query";
import { MEDIA_MAX_BYTES, type MediaAssetDto } from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const ACCEPTED = ["image/jpeg", "image/png"];

/** Returns a friendly message when the file cannot be used as a WhatsApp header image. */
export function imageProblem(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Choose a JPG or PNG image.";
  if (file.size > MEDIA_MAX_BYTES) return "The image must be 5 MB or smaller.";
  return null;
}

/** Uploads a header image; resolves with the public https link to store on the template/campaign. */
export function useUploadImage() {
  return useMutation({
    mutationFn: (file: File) =>
      api<MediaAssetDto>("/media", { method: "POST", rawBody: file, query: { filename: file.name } }),
  });
}
