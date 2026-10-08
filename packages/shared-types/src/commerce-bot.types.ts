import { z } from "zod";

/**
 * Phase 3: commerce bot catalog admin DTOs shared between apps/api and
 * apps/web. Covers categories, machines, and their configuration
 * groups/options — the flow structure itself stays fixed in code.
 */

export const SaveMachineCategoryRequestSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type SaveMachineCategoryRequest = z.infer<typeof SaveMachineCategoryRequestSchema>;

export const MachineSpecsSchema = z.object({
  power: z.string().optional(),
  capacity: z.string().optional(),
  warranty: z.string().optional(),
  installation: z.string().optional(),
  delivery: z.string().optional(),
});
export type MachineSpecs = z.infer<typeof MachineSpecsSchema>;

export const MachineAvailabilitySchema = z.enum(["in_stock", "made_to_order", "out_of_stock"]);
export type MachineAvailability = z.infer<typeof MachineAvailabilitySchema>;

export const SaveMachineRequestSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(150),
  model: z.string().min(1).max(100),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "basePrice must be a plain decimal string, e.g. \"850000\" or \"850000.00\""),
  availability: MachineAvailabilitySchema.optional(),
  specs: MachineSpecsSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type SaveMachineRequest = z.infer<typeof SaveMachineRequestSchema>;

export const SaveConfigGroupRequestSchema = z.object({
  name: z.string().min(1).max(100),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type SaveConfigGroupRequest = z.infer<typeof SaveConfigGroupRequestSchema>;

export const SaveConfigOptionRequestSchema = z.object({
  label: z.string().min(1).max(100),
  priceDelta: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "priceDelta must be a plain decimal string, e.g. \"25000\" or \"0\""),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type SaveConfigOptionRequest = z.infer<typeof SaveConfigOptionRequestSchema>;
