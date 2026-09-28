/**
 * Mock services with async, API-shaped signatures. Replace mockBranchService / mockSalesService
 * with fetch-based implementations of the same interfaces to go live.
 */
import type { Activity, Branch, BranchStatus, Db, InventoryMovement, InventoryRecord, Product, Sale, StockRequest } from "@/data/mock-db";
import { findInventory, getAvailable, getRequestOutstanding } from "@/lib/inventory-calculations";
import { getAccessScope } from "@/lib/session";
import { getDb, setDb } from "@/services/mock-store";

export type FieldErrors = Partial<Record<"name" | "code" | "location" | "email" | "address" | "phone" | "managerId" | "form" | "branchId" | "salesRepId" | "productId" | "quantity" | "unitPrice" | "saleDate" | "note" | "reason" | "sku" | "category" | "unit" | "unitCost" | "threshold", string>>;
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
  else if (branch && !errors.productId) {
    const inv = findInventory(db, input.branchId, input.productId);
    const available = inv ? getAvailable(inv) : 0;
    if (input.quantity > available) errors.quantity = `Insufficient stock — only ${available} available at this branch`;
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) errors.unitPrice = "Enter a valid unit price";
  if (!input.saleDate) errors.saleDate = "Sale date is required";
  else if (input.saleDate > db.tenant.referenceDate) errors.saleDate = "Sale date cannot be in the future";
  return errors;
}

export const mockSalesService = {
  async record(input: SaleInput, actorId: string): Promise<Result<Sale>> {
    await latency();
    const current = getDb();
    const actor = getAccessScope(current, actorId);
    // Sales reps always record against themselves, their branch and tenant.
    if (actor.repId) input = { ...input, salesRepId: actor.repId, branchId: actor.user.branchId ?? input.branchId, unitPrice: current.products.find((p) => p.id === input.productId)?.unitPrice ?? input.unitPrice };
    if (!actor.canRecordSales) return { ok: false, errors: { form: "You cannot record sales" } };
    const errors = validateSale(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const n = current.sales.length + 1;
    const sale: Sale = {
      id: `sale-${String(n).padStart(5, "0")}`, tenantId: current.tenant.id, code: `SAL-${10000 + n}`, ...input,
      createdAt: input.saleDate === current.tenant.referenceDate ? nowOnReferenceDay(current) : `${input.saleDate}T12:00:00`, status: "completed",
    };
    const product = current.products.find((pr) => pr.id === input.productId);
    const branch = current.branches.find((b) => b.id === input.branchId);
    setDb((d) => ({ ...applyInventoryChange(d, { branchId: sale.branchId, productId: sale.productId, delta: -sale.quantity, type: "sale", referenceType: "sale", referenceId: sale.id, performedBy: sale.salesRepId, at: sale.createdAt }), sales: [...d.sales, sale], activities: [activity(d, actorId, "Sale recorded", `${branch?.name} · ${product?.name} × ${input.quantity}`), ...d.activities] }));
    return { ok: true, data: sale };
  },
};

// ---------- inventory ----------
type InventoryChange = {
  branchId: string; productId: string; delta: number; type: InventoryMovement["type"];
  referenceType?: InventoryMovement["referenceType"]; referenceId?: string | undefined; performedBy: string; at: string; note?: string | undefined;
};

/**
 * The ONLY path that changes quantityOnHand. Every change writes a matching movement,
 * and callers must validate first — a change that would go negative is refused.
 */
export function applyInventoryChange(d: Db, c: InventoryChange): Db {
  const existing = findInventory(d, c.branchId, c.productId);
  const onHand = (existing?.quantityOnHand ?? 0) + c.delta;
  if (onHand < 0) throw new Error("Inventory can never become negative");
  const record: InventoryRecord = existing
    ? { ...existing, quantityOnHand: onHand, quantityReserved: Math.min(existing.quantityReserved, onHand), lastUpdated: c.at }
    : { id: `inv-${c.branchId.slice(-3)}-${c.productId.slice(-3)}`, tenantId: d.tenant.id, branchId: c.branchId, productId: c.productId, quantityOnHand: onHand, quantityReserved: 0, lowStockThreshold: 10, reorderLevel: 20, lastUpdated: c.at };
  const movement: InventoryMovement = {
    id: `mov-${String(d.inventoryMovements.length + 1).padStart(5, "0")}`, tenantId: d.tenant.id, branchId: c.branchId, productId: c.productId,
    type: c.type, quantity: c.delta, performedBy: c.performedBy, createdAt: c.at,
    ...(c.referenceType ? { referenceType: c.referenceType } : {}), ...(c.referenceId ? { referenceId: c.referenceId } : {}), ...(c.note ? { note: c.note } : {}),
  };
  return {
    ...d,
    inventory: existing ? d.inventory.map((i) => (i.id === existing.id ? record : i)) : [...d.inventory, record],
    inventoryMovements: [...d.inventoryMovements, movement],
  };
}

export type AddStockInput = { branchId: string; productId: string; quantity: number; note: string };
const labels = (d: Db, branchId: string, productId: string) => `${d.branches.find((b) => b.id === branchId)?.name} · ${d.products.find((p) => p.id === productId)?.name}`;

export const mockInventoryService = {
  async addStock(input: AddStockInput, actorId: string): Promise<Result<InventoryRecord>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    const errors: FieldErrors = {};
    if (!scope.canManageStock) return { ok: false, errors: { form: "Only storekeepers can add stock" } };
    const branch = current.branches.find((b) => b.id === input.branchId);
    if (!branch) errors.branchId = "Select a branch";
    else if (branch.status !== "active") errors.branchId = "Stock can only be added to active branches";
    else if (scope.branchIds && !scope.branchIds.includes(branch.id)) errors.branchId = "You can only add stock to your branch";
    if (!current.products.some((p) => p.id === input.productId)) errors.productId = "Select a product";
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.quantity = "Enter a whole number greater than zero";
    if (Object.keys(errors).length) return { ok: false, errors };
    const at = nowOnReferenceDay(current);
    setDb((d) => ({ ...applyInventoryChange(d, { ...input, delta: input.quantity, type: "stock_added", referenceType: "manual", performedBy: actorId, at, note: input.note.trim() || undefined }), activities: [activity(d, actorId, "Stock added", `${labels(d, input.branchId, input.productId)} · +${input.quantity}`), ...d.activities] }));
    return { ok: true, data: findInventory(getDb(), input.branchId, input.productId)! };
  },
  /** Stock count correction: sets on-hand to the counted quantity and records the delta. */
  async adjustStock(inventoryId: string, countedQuantity: number, reason: string, actorId: string): Promise<Result<InventoryRecord>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    const inv = current.inventory.find((i) => i.id === inventoryId);
    if (!scope.canManageStock || !inv || (scope.branchIds && !scope.branchIds.includes(inv.branchId))) return { ok: false, errors: { form: "You cannot adjust this stock record" } };
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) return { ok: false, errors: { quantity: "Enter a whole number of zero or more" } };
    if (countedQuantity < inv.quantityReserved) return { ok: false, errors: { quantity: `Cannot go below the ${inv.quantityReserved} reserved units` } };
    if (countedQuantity === inv.quantityOnHand) return { ok: false, errors: { quantity: "Counted quantity matches current stock" } };
    if (!reason.trim()) return { ok: false, errors: { reason: "Give a reason for the adjustment" } };
    const at = nowOnReferenceDay(current);
    setDb((d) => ({ ...applyInventoryChange(d, { branchId: inv.branchId, productId: inv.productId, delta: countedQuantity - inv.quantityOnHand, type: "adjustment", referenceType: "manual", performedBy: actorId, at, note: reason.trim() }), activities: [activity(d, actorId, "Stock adjusted", `${labels(d, inv.branchId, inv.productId)} · ${inv.quantityOnHand} → ${countedQuantity}`), ...d.activities] }));
    return { ok: true, data: getDb().inventory.find((i) => i.id === inventoryId)! };
  },
};

// ---------- stock requests ----------
export type StockRequestInput = { branchId: string; productId: string; quantity: number; note: string };
function updateRequest(d: Db, id: string, patch: Partial<StockRequest>): Db {
  return { ...d, stockRequests: d.stockRequests.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}
function reviewable(db: Db, id: string, actorId: string, perm: "canReviewRequests" | "canFulfillRequests") {
  const scope = getAccessScope(db, actorId);
  const req = db.stockRequests.find((r) => r.id === id);
  if (!req) return { error: "Stock request not found" } as const;
  if (!scope[perm] || (scope.branchIds && !scope.branchIds.includes(req.branchId))) return { error: "You don't have permission for this action" } as const;
  return { req } as const;
}

export const mockStockRequestService = {
  async create(input: StockRequestInput, actorId: string): Promise<Result<StockRequest>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canCreateRequests) return { ok: false, errors: { form: "Only sales representatives can submit stock requests" } };
    const errors: FieldErrors = {};
    const branch = current.branches.find((b) => b.id === input.branchId);
    if (!branch || branch.status !== "active") errors.branchId = "Select an active branch";
    else if (scope.user.branchId !== branch.id) errors.branchId = "You can only request stock for your own branch";
    if (!current.products.some((p) => p.id === input.productId)) errors.productId = "Select a product";
    else if (branch && !findInventory(current, branch.id, input.productId)) errors.productId = "This branch does not stock this product";
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) errors.quantity = "Enter a whole number greater than zero";
    if (Object.keys(errors).length) return { ok: false, errors };
    const max = Math.max(1000, ...current.stockRequests.map((r) => Number(r.id.split("-")[1]) || 0));
    const req: StockRequest = {
      id: `SR-${max + 1}`, tenantId: current.tenant.id, branchId: input.branchId, repId: actorId, productId: input.productId,
      quantityRequested: input.quantity, status: "pending", priority: "Normal", requestedAt: nowOnReferenceDay(current),
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    };
    setDb((d) => ({ ...d, stockRequests: [req, ...d.stockRequests], activities: [activity(d, actorId, "Stock request submitted", `${labels(d, req.branchId, req.productId)} · ${req.quantityRequested} units`), ...d.activities] }));
    return { ok: true, data: req };
  },
  /** Pending → Approved. Never touches inventory. */
  async approve(id: string, actorId: string): Promise<Result<StockRequest>> {
    await latency();
    const current = getDb();
    const check = reviewable(current, id, actorId, "canReviewRequests");
    if ("error" in check) return { ok: false, errors: { form: check.error } };
    if (check.req.status !== "pending") return { ok: false, errors: { form: "Only pending requests can be approved" } };
    const at = nowOnReferenceDay(current);
    setDb((d) => ({ ...updateRequest(d, id, { status: "approved", quantityApproved: check.req.quantityRequested, approvedAt: at, approvedBy: actorId, processedBy: actorId }), activities: [activity(d, actorId, "Stock request approved", `${id} · ${labels(d, check.req.branchId, check.req.productId)}`), ...d.activities] }));
    return { ok: true, data: getDb().stockRequests.find((r) => r.id === id)! };
  },
  /** Pending → Rejected. The record is kept for history. */
  async reject(id: string, reason: string, actorId: string): Promise<Result<StockRequest>> {
    await latency();
    const current = getDb();
    const check = reviewable(current, id, actorId, "canReviewRequests");
    if ("error" in check) return { ok: false, errors: { form: check.error } };
    if (check.req.status !== "pending") return { ok: false, errors: { form: "Only pending requests can be rejected" } };
    if (!reason.trim()) return { ok: false, errors: { reason: "A rejection reason is required" } };
    setDb((d) => ({ ...updateRequest(d, id, { status: "rejected", rejectedAt: nowOnReferenceDay(d), processedBy: actorId, rejectionReason: reason.trim() }), activities: [activity(d, actorId, "Stock request rejected", `${id} · ${reason.trim()}`), ...d.activities] }));
    return { ok: true, data: getDb().stockRequests.find((r) => r.id === id)! };
  },
  /** Approved / Partially fulfilled → (Partially) Fulfilled. The only step that deducts stock. */
  async fulfill(id: string, quantity: number, actorId: string): Promise<Result<StockRequest>> {
    await latency();
    const current = getDb();
    const check = reviewable(current, id, actorId, "canFulfillRequests");
    if ("error" in check) return { ok: false, errors: { form: check.error } };
    const req = check.req;
    if (req.status !== "approved" && req.status !== "partially_fulfilled") return { ok: false, errors: { form: "Only approved requests can be fulfilled" } };
    const inv = findInventory(current, req.branchId, req.productId);
    const available = inv ? getAvailable(inv) : 0;
    const outstanding = getRequestOutstanding(req);
    if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, errors: { quantity: "Enter a whole number greater than zero" } };
    if (quantity > available) return { ok: false, errors: { quantity: "Insufficient stock. Quantity cannot exceed available stock." } };
    if (quantity > outstanding) return { ok: false, errors: { quantity: `Only ${outstanding} units are outstanding on this request` } };
    const at = nowOnReferenceDay(current);
    const fulfilled = (req.quantityFulfilled ?? 0) + quantity;
    const status = fulfilled >= (req.quantityApproved ?? req.quantityRequested) ? "fulfilled" : "partially_fulfilled";
    const rep = current.users.find((u) => u.id === req.repId)?.name;
    setDb((d) => ({
      ...updateRequest(applyInventoryChange(d, { branchId: req.branchId, productId: req.productId, delta: -quantity, type: "stock_issued", referenceType: "stock_request", referenceId: req.id, performedBy: actorId, at, note: `Issued to ${rep}` }), id, { status, quantityFulfilled: fulfilled, fulfilledAt: at, fulfilledBy: actorId, processedBy: actorId }),
      activities: [activity(d, actorId, status === "fulfilled" ? "Stock request fulfilled" : "Stock request partially fulfilled", `${id} · ${quantity} units to ${rep}`), ...d.activities],
    }));
    return { ok: true, data: getDb().stockRequests.find((r) => r.id === id)! };
  },
};

// Swap points for the live API.
// ---------- products ----------
export type ProductInput = { name: string; sku: string; category: string; unit: string; unitPrice: number; unitCost: number; lowStockThreshold: number };
export const mockProductService = {
  /** Adds to the shared catalogue and opens a zero-stock inventory record at the storekeeper's branch. */
  async create(input: ProductInput, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canManageProducts) return { ok: false, errors: { form: "Only storekeepers can add products" } };
    const errors: FieldErrors = {};
    const sku = input.sku.trim().toUpperCase();
    if (!input.name.trim()) errors.name = "Enter a product name";
    if (!sku) errors.sku = "Enter a SKU";
    else if (current.products.some((p) => p.sku.toUpperCase() === sku)) errors.sku = "This SKU already exists";
    if (!input.category.trim()) errors.category = "Enter a category";
    if (!input.unit.trim()) errors.unit = "Enter a unit";
    if (!(input.unitPrice > 0)) errors.unitPrice = "Enter a selling price above zero";
    if (!(input.unitCost >= 0)) errors.unitCost = "Enter a unit cost of zero or more";
    else if (input.unitCost > input.unitPrice) errors.unitCost = "Unit cost cannot exceed selling price";
    if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) errors.threshold = "Enter a whole number of zero or more";
    if (Object.keys(errors).length) return { ok: false, errors };
    const product: Product = { id: `prod-${String(current.products.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`, tenantId: current.tenant.id, name: input.name.trim(), sku, category: input.category.trim(), unit: input.unit.trim(), unitPrice: input.unitPrice, unitCost: input.unitCost };
    const at = nowOnReferenceDay(current);
    const branchIds = scope.branchIds ?? current.branches.filter((b) => b.status === "active").map((b) => b.id);
    const records: InventoryRecord[] = branchIds.map((branchId, i) => ({ id: `inv-${product.id}-${i}`, tenantId: current.tenant.id, branchId, productId: product.id, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: input.lowStockThreshold, reorderLevel: input.lowStockThreshold * 2, lastUpdated: at }));
    setDb((d) => ({ ...d, products: [...d.products, product], inventory: [...d.inventory, ...records], activities: [activity(d, actorId, "Product added", `${product.name} · ${product.sku}`), ...d.activities] }));
    return { ok: true, data: product };
  },
};

export const productService = mockProductService;
export const branchService = mockBranchService;
export const salesService = mockSalesService;
export const stockRequestService = mockStockRequestService;
export const inventoryService = mockInventoryService;
