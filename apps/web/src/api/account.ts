import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChangePasswordRequest,
  CreateUserRequest,
  UpdateMyTenantRequest,
  UpdateUserRequest,
  User,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const usersKey = ["users"] as const;

/** Everyone in the business (the API only returns the caller's own business). */
export function useTeamUsers() {
  return useQuery({ queryKey: usersKey, queryFn: () => api<User[]>("/users") });
}

function useRefreshUsers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: usersKey });
}

export function useCreateUser() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: (body: Omit<CreateUserRequest, "role"> & { role: "tenant_admin" | "agent" }) =>
      api<User>("/users", { method: "POST", body }),
    onSuccess: refresh,
  });
}

export function useUpdateUser() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) =>
      api<User>(`/users/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api<void>(`/users/${id}/reset-password`, { method: "POST", body: { newPassword } }),
  });
}

export function useUpdateMyProfile() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: (displayName: string) =>
      api<User>("/users/me", { method: "PATCH", body: { displayName } }),
    onSuccess: refresh,
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      api<void>("/users/me/password", { method: "POST", body }),
  });
}

export function useUpdateMyBusiness() {
  return useMutation({
    mutationFn: (body: UpdateMyTenantRequest) =>
      api("/tenants/me", { method: "PATCH", body }),
  });
}

/** IANA time zones for the picker, with the common ones first. */
export function timeZoneOptions(current: string): string[] {
  const all = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [];
  const common = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
  return [...new Set([current, ...common, ...all])];
}
