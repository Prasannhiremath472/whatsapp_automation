import { create } from "zustand";
import type { ConversationStatus } from "@whatsapp-crm/shared-types";

interface InboxState {
  selectedConversationId: string | null;
  composeDraft: string;
  statusFilter: ConversationStatus | "all";
  assignedToMeOnly: boolean;
  selectConversation: (id: string | null) => void;
  setComposeDraft: (text: string) => void;
  setStatusFilter: (status: ConversationStatus | "all") => void;
  setAssignedToMeOnly: (value: boolean) => void;
}

/** Ephemeral UI-only state for the inbox — server data lives in TanStack Query. */
export const useInboxStore = create<InboxState>((set) => ({
  selectedConversationId: null,
  composeDraft: "",
  statusFilter: "open",
  assignedToMeOnly: false,
  selectConversation: (id) => set({ selectedConversationId: id, composeDraft: "" }),
  setComposeDraft: (text) => set({ composeDraft: text }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setAssignedToMeOnly: (value) => set({ assignedToMeOnly: value }),
}));
