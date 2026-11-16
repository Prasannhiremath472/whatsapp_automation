import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BulkTagRequest,
  ContactDto,
  CreateContactRequest,
  ImportContactsRequest,
  ImportContactsResult,
  Paginated,
  UpdateContactRequest,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

export interface ContactFilters {
  page: number;
  pageSize: number;
  q?: string;
  tag?: string;
  location?: string;
  leadStatus?: string;
  optedOut?: boolean;
}

const keys = {
  all: ["contacts"] as const,
  list: (f: ContactFilters) => ["contacts", "list", f] as const,
  tags: ["contacts", "tags"] as const,
  locations: ["contacts", "locations"] as const,
};

export function useContacts(filters: ContactFilters) {
  return useQuery({
    queryKey: keys.list(filters),
    queryFn: ({ signal }) =>
      api<Paginated<ContactDto>>("/contacts", {
        signal,
        query: {
          ...filters,
          optedOut: filters.optedOut === undefined ? undefined : String(filters.optedOut),
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useContactTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api<{ name: string; contacts: number }[]>("/contacts/tags"),
  });
}

export function useContactLocations() {
  return useQuery({
    queryKey: keys.locations,
    queryFn: () => api<string[]>("/contacts/locations"),
  });
}

function useInvalidateContacts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
}

export function useCreateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (body: CreateContactRequest) =>
      api<ContactDto>("/contacts", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useUpdateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContactRequest }) =>
      api<ContactDto>(`/contacts/${id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useBulkTag() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (body: BulkTagRequest) =>
      api<{ affected: number }>("/contacts/bulk-tags", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useBulkDeleteContacts() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api<{ deleted: number; blocked: number }>("/contacts/bulk-delete", {
        method: "POST",
        body: { contactIds },
      }),
    onSuccess: invalidate,
  });
}

const IMPORT_CHUNK = 1000;

/**
 * Imports parsed CSV rows in chunks (the API accepts up to 2000 per request)
 * and merges the per-chunk results. `onProgress` receives rows processed so far.
 */
export async function importContactsInChunks(
  base: Omit<ImportContactsRequest, "rows">,
  rows: ImportContactsRequest["rows"],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportContactsResult> {
  const total: ImportContactsResult = { created: 0, updated: 0, skipped: 0, invalid: [] };
  for (let start = 0; start < rows.length; start += IMPORT_CHUNK) {
    const chunk = rows.slice(start, start + IMPORT_CHUNK);
    const result = await api<ImportContactsResult>("/contacts/import", {
      method: "POST",
      body: { ...base, rows: chunk },
    });
    total.created += result.created;
    total.updated += result.updated;
    total.skipped += result.skipped;
    // Row numbers are relative to the chunk; make them relative to the file.
    total.invalid.push(...result.invalid.map((i) => ({ ...i, row: i.row + start })));
    onProgress?.(Math.min(start + chunk.length, rows.length), rows.length);
  }
  return total;
}
