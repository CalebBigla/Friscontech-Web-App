/**
 * Mock services with async, API-shaped signatures. Replace mockBranchService / mockSalesService
 * with fetch-based implementations of the same interfaces to go live.
 */
import type { Activity, Branch, BranchStatus, Db, Sale } from "@/data/mock-db";
import { getDb, setDb } from "@/services/mock-store";

export type FieldErrors = Partial<Record<"name" | "code" | "location" | "email" | "address" | "phone" | "managerId" | "form" | "branchId" | "salesRepId" | "productId" | "quantity" | "unitPrice" | "saleDate", string>>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };
export type BranchInput = { name: string; code: string; location: string; address: string; phone: string; email: string; managerId: string; status: BranchStatus };
export type SaleInput = { branchId: string; salesRepId: string; productId: string; quantity: number; unitPrice: number; saleDate: string };

const latency = () => new Promise((r) => setTimeout(r, 350));
function nowOnReferenceDay(db: Db) {
  const d = new Date();
  return `${db.tenant.referenceDate}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}
function activity(db: Db, actorId: string, action: string, subject: string): Activity {
  return { id: `act-${db.activities.length + 1}-${Date.now()}`, tenantId: db.tenant.id, action, subject, actorId, createdAt: nowOnReferenceDay(db) };
}

export function validateBranch(db: Db, input: BranchInput, editingId?: string) {
  const errors: FieldErrors = {};
  if (!input.name.trim()) errors.name = "Branch name is required";
  if (!input.code.trim()) errors.code = "Branch code is required";
  else if (db.branches.some((b) => b.id !== editingId && b.code.toLowerCase() === input.code.trim().toLowerCase())) errors.code = "This branch code is already in use";
  if (!input.location.trim()) errors.location = "Location is required";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Enter a valid email";
  const manager = db.users.find((x) => x.id === input.managerId);
  if (!manager || manager.role !== "manager") errors.managerId = "Select a branch manager";
  else if (db.branches.some((b) => b.id !== editingId && b.managerId === manager.id && b.status === "active")) errors.managerId = "This manager already runs another active branch";
  return errors;
}

/** Assign the manager to the branch and release the previous manager. */
function reassignManager(db: Db, branchId: string, previousManagerId: string | null, managerId: string) {
  return db.users.map((x) => {
    if (x.id === managerId) return { ...x, branchId };
    if (x.id === previousManagerId && previousManagerId !== managerId) return { ...x, branchId: null };
    return x;
  });
}

export const mockBranchService = {
  async create(input: BranchInput, actorId: string): Promise<Result<Branch>> {
    await latency();
    const current = getDb();
    const errors = validateBranch(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branch: Branch = {
      id: `branch-${String(current.branches.length + 1).padStart(3, "0")}`, tenantId: current.tenant.id,
      ...input, name: input.name.trim(), code: input.code.trim().toUpperCase(), createdAt: current.tenant.referenceDate,
    };
    setDb((d) => ({ ...d, branches: [...d.branches, branch], users: reassignManager(d, branch.id, null, input.managerId), activities: [activity(d, actorId, "Branch created", `${branch.name} · ${branch.code}`), ...d.activities] }));
    return { ok: true, data: branch };
  },
  async update(id: string, input: BranchInput, actorId: string): Promise<Result<Branch>> {
    await latency();
    const current = getDb();
    const existing = current.branches.find((b) => b.id === id);
    if (!existing) return { ok: false, errors: { form: "Branch not found" } };
    const errors = validateBranch(current, input, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branch: Branch = { ...existing, ...input, name: input.name.trim(), code: input.code.trim().toUpperCase() };
    setDb((d) => ({ ...d, branches: d.branches.map((b) => (b.id === id ? branch : b)), users: reassignManager(d, id, existing.managerId, input.managerId), activities: [activity(d, actorId, "Branch updated", branch.name), ...d.activities] }));
    return { ok: true, data: branch };
  },
  /** Soft-delete: history (sales, inventory, staff links) is preserved. */
  async deactivate(id: string, actorId: string): Promise<Result<Branch>> {
    await latency();
    const existing = getDb().branches.find((b) => b.id === id);
    if (!existing) return { ok: false, errors: { form: "Branch not found" } };
    const branch = { ...existing, status: "inactive" as const };
    setDb((d) => ({ ...d, branches: d.branches.map((b) => (b.id === id ? branch : b)), activities: [activity(d, actorId, "Branch deactivated", branch.name), ...d.activities] }));
    return { ok: true, data: branch };
  },
};

export function validateSale(db: Db, input: SaleInput) {
  const errors: FieldErrors = {};
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (!branch) errors.branchId = "Branch is required";
  else if (branch.status !== "active") errors.branchId = "Sales can only be recorded for active branches";
  const rep = db.users.find((x) => x.id === input.salesRepId);
  if (!rep) errors.salesRepId = "Sales representative is required";
  else if (rep.role !== "sales_rep" || rep.branchId !== input.branchId) errors.salesRepId = "Rep must belong to the selected branch";
  if (!db.products.some((pr) => pr.id === input.productId)) errors.productId = "Product is required";
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.quantity = "Quantity must be greater than zero";
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) errors.unitPrice = "Enter a valid unit price";
  if (!input.saleDate) errors.saleDate = "Sale date is required";
  else if (input.saleDate > db.tenant.referenceDate) errors.saleDate = "Sale date cannot be in the future";
  return errors;
}

export const mockSalesService = {
  async record(input: SaleInput, actorId: string): Promise<Result<Sale>> {
    await latency();
    const current = getDb();
    const errors = validateSale(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const n = current.sales.length + 1;
    const sale: Sale = {
      id: `sale-${String(n).padStart(5, "0")}`, tenantId: current.tenant.id, code: `SAL-${10000 + n}`, ...input,
      createdAt: input.saleDate === current.tenant.referenceDate ? nowOnReferenceDay(current) : `${input.saleDate}T12:00:00`, status: "completed",
    };
    const product = current.products.find((pr) => pr.id === input.productId);
    const branch = current.branches.find((b) => b.id === input.branchId);
    setDb((d) => ({ ...d, sales: [...d.sales, sale], activities: [activity(d, actorId, "Sale recorded", `${branch?.name} · ${product?.name} × ${input.quantity}`), ...d.activities] }));
    return { ok: true, data: sale };
  },
};

export const mockStockRequestService = {
  async approve(id: string, actorId: string) {
    const req = getDb().stockRequests.find((r) => r.id === id);
    if (!req) return;
    setDb((d) => {
      const branch = d.branches.find((b) => b.id === req.branchId);
      const product = d.products.find((pr) => pr.id === req.productId);
      return { ...d, stockRequests: d.stockRequests.map((r) => (r.id === id ? { ...r, status: "approved" } : r)), activities: [activity(d, actorId, "Stock request approved", `${branch?.name} · ${product?.name}`), ...d.activities] };
    });
  },
};

// Swap points for the live API.
export const branchService = mockBranchService;
export const salesService = mockSalesService;
export const stockRequestService = mockStockRequestService;
