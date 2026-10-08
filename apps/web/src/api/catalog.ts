import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MachineAvailability,
  MachineSpecs,
  SaveConfigGroupRequest,
  SaveConfigOptionRequest,
  SaveMachineCategoryRequest,
  SaveMachineRequest,
} from "@whatsapp-crm/shared-types";
import { apiClient } from "../lib/api-client";

export interface MachineCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Machine {
  id: string;
  categoryId: string;
  name: string;
  model: string;
  basePrice: string;
  availability: MachineAvailability;
  specs: MachineSpecs;
  sortOrder: number;
  isActive: boolean;
}

export interface MachineConfigOption {
  id: string;
  groupId: string;
  label: string;
  priceDelta: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface MachineConfigGroup {
  id: string;
  machineId: string;
  name: string;
  isRequired: boolean;
  sortOrder: number;
  options: MachineConfigOption[];
}

export type MachineWithConfig = Machine & { configGroups: MachineConfigGroup[] };

const categoriesKey = ["commerce-bot", "categories"];
const machinesKey = ["commerce-bot", "machines"];
const machineKey = (id: string) => ["commerce-bot", "machines", id];

export function useCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: async () => (await apiClient.get<MachineCategory[]>("/commerce-bot/categories")).data,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveMachineCategoryRequest) =>
      (await apiClient.post<MachineCategory>("/commerce-bot/categories", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<SaveMachineCategoryRequest>) =>
      (await apiClient.patch<MachineCategory>(`/commerce-bot/categories/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useDeactivateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/commerce-bot/categories/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useMachines() {
  return useQuery({
    queryKey: machinesKey,
    queryFn: async () => (await apiClient.get<Machine[]>("/commerce-bot/machines")).data,
  });
}

export function useMachine(id: string | null) {
  return useQuery({
    queryKey: machineKey(id ?? ""),
    queryFn: async () => (await apiClient.get<MachineWithConfig>(`/commerce-bot/machines/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveMachineRequest) => (await apiClient.post<Machine>("/commerce-bot/machines", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machinesKey }),
  });
}

export function useUpdateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<SaveMachineRequest>) =>
      (await apiClient.patch<Machine>(`/commerce-bot/machines/${id}`, body)).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: machinesKey });
      qc.invalidateQueries({ queryKey: machineKey(vars.id) });
    },
  });
}

export function useDeactivateMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/commerce-bot/machines/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machinesKey }),
  });
}

export function useCreateConfigGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ machineId, ...body }: { machineId: string } & SaveConfigGroupRequest) =>
      (await apiClient.post<MachineConfigGroup>(`/commerce-bot/machines/${machineId}/config-groups`, body)).data,
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: machineKey(vars.machineId) }),
  });
}

export function useUpdateConfigGroup(machineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<SaveConfigGroupRequest>) =>
      (await apiClient.patch<MachineConfigGroup>(`/commerce-bot/config-groups/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machineKey(machineId) }),
  });
}

export function useDeleteConfigGroup(machineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/commerce-bot/config-groups/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machineKey(machineId) }),
  });
}

export function useCreateConfigOption(machineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, ...body }: { groupId: string } & SaveConfigOptionRequest) =>
      (await apiClient.post<MachineConfigOption>(`/commerce-bot/config-groups/${groupId}/options`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machineKey(machineId) }),
  });
}

export function useUpdateConfigOption(machineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Partial<SaveConfigOptionRequest>) =>
      (await apiClient.patch<MachineConfigOption>(`/commerce-bot/config-options/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machineKey(machineId) }),
  });
}

export function useDeleteConfigOption(machineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/commerce-bot/config-options/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: machineKey(machineId) }),
  });
}
