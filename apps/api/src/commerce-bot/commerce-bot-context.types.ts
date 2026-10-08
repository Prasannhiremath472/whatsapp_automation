/**
 * Documents the shape BotSession.contextData grows into as a conversation
 * moves through the flow. Not enforced by the DB (it's Json) — every reader
 * must parse defensively since it's mutated incrementally step by step.
 */
export interface SelectedConfigEntry {
  groupId: string;
  groupName: string;
  optionId: string;
  optionLabel: string;
  priceDelta: string;
}

export interface AddressDraft {
  name?: string;
  company?: string;
  mobile?: string;
  email?: string;
  gstNumber?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pin?: string;
}

export interface PricingSnapshot {
  unitPrice: string;
  subtotal: string;
  gstAmount: string;
  totalAmount: string;
}

export interface BotContextData {
  machineId?: string;
  categoryId?: string;
  quantity?: number;
  pendingConfigGroups?: string[];
  selectedConfig?: SelectedConfigEntry[];
  useAddressChoice?: 'saved' | 'new';
  addressDraft?: AddressDraft;
  pricing?: PricingSnapshot;
}

export function asBotContextData(value: unknown): BotContextData {
  if (value && typeof value === 'object') {
    return value as BotContextData;
  }
  return {};
}
