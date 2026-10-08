import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import {
  useCategories,
  useCreateCategory,
  useCreateConfigGroup,
  useCreateConfigOption,
  useCreateMachine,
  useDeactivateCategory,
  useDeactivateMachine,
  useDeleteConfigGroup,
  useDeleteConfigOption,
  useMachine,
  useMachines,
  useUpdateConfigGroup,
  useUpdateConfigOption,
  type MachineCategory,
} from "../api/catalog";

function formatInr(value: string): string {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num)) return value;
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function CategoriesPanel() {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deactivateCategory = useDeactivateCategory();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createCategory.mutate({ name: name.trim() }, { onSuccess: () => setName("") });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Categories</h2>
      <div className="mb-3 flex gap-2">
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={handleCreate} disabled={!name.trim() || createCategory.isPending}>
          Add
        </Button>
      </div>
      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
      <ul className="divide-y divide-gray-100">
        {categories?.map((c: MachineCategory) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span className={c.isActive ? "text-gray-900" : "text-gray-400 line-through"}>{c.name}</span>
            {c.isActive && (
              <button
                onClick={() => deactivateCategory.mutate(c.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Deactivate
              </button>
            )}
          </li>
        ))}
        {categories?.length === 0 && <li className="py-2 text-xs text-gray-400">No categories yet.</li>}
      </ul>
    </div>
  );
}

function NewMachineForm({ categories }: { categories: MachineCategory[] }) {
  const createMachine = useCreateMachine();
  const [form, setForm] = useState({ categoryId: "", name: "", model: "", basePrice: "" });

  const handleCreate = () => {
    if (!form.categoryId || !form.name || !form.model || !form.basePrice) return;
    createMachine.mutate(
      { categoryId: form.categoryId, name: form.name, model: form.model, basePrice: form.basePrice },
      { onSuccess: () => setForm({ categoryId: "", name: "", model: "", basePrice: "" }) },
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Add Machine</h2>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
        >
          <option value="">Select category…</option>
          {categories.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input placeholder="Name (e.g. CNC Turning Machine)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input placeholder="Model (e.g. CNC-450)" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
        <Input placeholder="Base price (e.g. 850000)" value={form.basePrice} onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))} />
      </div>
      <Button className="mt-3" onClick={handleCreate} disabled={createMachine.isPending}>
        Add Machine
      </Button>
    </div>
  );
}

function ConfigGroupEditor({ machineId, groupId, name }: { machineId: string; groupId: string; name: string }) {
  const { data: machine } = useMachine(machineId);
  const group = machine?.configGroups.find((g) => g.id === groupId);
  const updateGroup = useUpdateConfigGroup(machineId);
  const deleteGroup = useDeleteConfigGroup(machineId);
  const createOption = useCreateConfigOption(machineId);
  const updateOption = useUpdateConfigOption(machineId);
  const deleteOption = useDeleteConfigOption(machineId);

  const [optionForm, setOptionForm] = useState({ label: "", priceDelta: "0" });

  const handleAddOption = () => {
    if (!optionForm.label.trim()) return;
    createOption.mutate(
      { groupId, label: optionForm.label.trim(), priceDelta: optionForm.priceDelta || "0" },
      { onSuccess: () => setOptionForm({ label: "", priceDelta: "0" }) },
    );
  };

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <input
          className="border-b border-transparent text-sm font-medium text-gray-900 hover:border-gray-300 focus:border-emerald-500 focus:outline-none"
          defaultValue={name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== name && updateGroup.mutate({ id: groupId, name: e.target.value.trim() })}
        />
        <button onClick={() => deleteGroup.mutate(groupId)} className="text-xs text-red-600 hover:underline">
          Delete group
        </button>
      </div>
      <ul className="mb-2 space-y-1">
        {group?.options.map((o) => (
          <li key={o.id} className="flex items-center justify-between text-xs">
            <span className="text-gray-700">
              {o.label} {o.priceDelta !== "0" && <span className="text-gray-400">+{formatInr(o.priceDelta)}</span>}
              {o.isDefault && <span className="ml-1 text-emerald-600">(default)</span>}
            </span>
            <div className="flex gap-2">
              {!o.isDefault && (
                <button
                  onClick={() => updateOption.mutate({ id: o.id, isDefault: true })}
                  className="text-gray-400 hover:text-emerald-600 hover:underline"
                >
                  Set default
                </button>
              )}
              <button onClick={() => deleteOption.mutate(o.id)} className="text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Option label"
          value={optionForm.label}
          onChange={(e) => setOptionForm((f) => ({ ...f, label: e.target.value }))}
        />
        <input
          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="+Price"
          value={optionForm.priceDelta}
          onChange={(e) => setOptionForm((f) => ({ ...f, priceDelta: e.target.value }))}
        />
        <button onClick={handleAddOption} className="rounded bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200">
          Add option
        </button>
      </div>
    </div>
  );
}

function MachineDetailPanel({ machineId }: { machineId: string }) {
  const { data: machine, isLoading } = useMachine(machineId);
  const deactivateMachine = useDeactivateMachine();
  const createGroup = useCreateConfigGroup();
  const [newGroupName, setNewGroupName] = useState("");

  if (isLoading || !machine) return <div className="p-4 text-xs text-gray-400">Loading…</div>;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {machine.name} <span className="text-gray-400">({machine.model})</span>
          </h2>
          <p className="text-xs text-gray-500">{formatInr(machine.basePrice)} base price · {machine.availability}</p>
        </div>
        {machine.isActive && (
          <button onClick={() => deactivateMachine.mutate(machine.id)} className="text-xs text-red-600 hover:underline">
            Deactivate machine
          </button>
        )}
      </div>

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Configuration Groups</h3>
      <div className="space-y-3">
        {machine.configGroups.map((g) => (
          <ConfigGroupEditor key={g.id} machineId={machine.id} groupId={g.id} name={g.name} />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          placeholder="New group name (e.g. Motor)"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (!newGroupName.trim()) return;
            createGroup.mutate({ machineId: machine.id, name: newGroupName.trim() }, { onSuccess: () => setNewGroupName("") });
          }}
          disabled={!newGroupName.trim()}
        >
          Add Group
        </Button>
      </div>
    </div>
  );
}

function MachinesPanel({ categories }: { categories: MachineCategory[] }) {
  const { data: machines, isLoading } = useMachines();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Machines</h2>
        {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
        <ul className="divide-y divide-gray-100">
          {machines?.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => setSelectedId(m.id)}
                className={`w-full py-2 text-left text-sm ${selectedId === m.id ? "font-medium text-emerald-700" : "text-gray-700"} ${!m.isActive ? "text-gray-400 line-through" : ""}`}
              >
                {m.name} <span className="text-xs text-gray-400">({m.model})</span>
              </button>
            </li>
          ))}
          {machines?.length === 0 && <li className="py-2 text-xs text-gray-400">No machines yet.</li>}
        </ul>
      </div>
      <div className="col-span-2 space-y-4">
        <NewMachineForm categories={categories} />
        {selectedId && <MachineDetailPanel machineId={selectedId} />}
      </div>
    </div>
  );
}

export function CatalogAdminPage() {
  const { data: categories } = useCategories();

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Catalog</h1>
          <div className="space-y-4">
            <CategoriesPanel />
            {categories && <MachinesPanel categories={categories} />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
