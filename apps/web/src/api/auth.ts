import { useMutation } from "@tanstack/react-query";
import type { AuthResponse, LoginRequest } from "@whatsapp-crm/shared-types";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/auth.store";

async function loginRequest(input: LoginRequest): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", input);
  return data;
}

export function useLogin() {
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      login({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    },
  });
}
