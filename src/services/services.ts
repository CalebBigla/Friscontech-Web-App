/**
 * Mock services with async, API-shaped signatures. Replace mockBranchService / mockSalesService
 * with fetch-based implementations of the same interfaces to go live.
 */
import type { DateFormatPref, ReportPeriodPref, UserPreference, Role, User, UserStatus, Activity, Branch, BranchStatus, Db, InventoryMovement, InventoryRecord, Product, ProductStatus, Sale, StockRequest, Target } from "@/data/mock-db";
import { findInventory, getAvailable, getRequestOutstanding } from "@/lib/inventory-calculations";
import { getAccessScope } from "@/lib/session";
import { assignableRoles, canEditMember, roleNeedsBranch } from "@/lib/team";
import { getDb, setDb } from "@/services/mock-store";
import { entityFromAction } from "@/data/auditLogs";

export type FieldErrors = Partial<Record<"name" | "code" | "location" | "email" | "address" | "phone" | "managerId" | "form" | "branchId" | "salesRepId" | "productId" | "quantity" | "unitPrice" | "saleDate" | "note" | "reason" | "sku" | "category" | "unit" | "unitCost" | "threshold" | "description" | "repId" | "month" | "amount" | "role" | "status", string>>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };
export type BranchInput = { name: string; code: string; location: string; address: string; phone: string; email: string; managerId: string; status: BranchStatus };
export type SaleInput = { branchId: string; salesRepId: string; productId: string; quantity: number; unitPrice: number; saleDate: string };

const latency = () => new Promise((r) => setTimeout(r, 350));
function nowOnReferenceDay(db: Db) {
  const d = new Date();
  return `${db.tenant.referenceDate}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}
/** The single audit writer: every module appends to db.activities through here. Never pass secrets. */
export function createAuditLog(db: Db, actorId: string, action: string, subject: string, ref: { entityId?: string; branchId?: string | null; productId?: string } = {}): Activity {
  const branchId = ref.branchId === undefined ? db.users.find((u) => u.id === actorId)?.branchId ?? undefined : ref.branchId ?? undefined;
  const entityId = ref.entityId ?? subject.match(/\b(SR-\d+|SL-[\w-]+|REQ-\d+)\b/)?.[1];
  const metadata = { ...(branchId ? { branchId } : {}), ...(ref.productId ? { productId: ref.productId } : {}) };
  return {
    id: `act-${db.activities.length + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId: db.tenant.id, action, subject, actorId, createdAt: nowOnReferenceDay(db),
    entity: entityFromAction(action), ...(entityId ? { entityId } : {}), ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}
const activity = createAuditLog;

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
  const saleProduct = db.products.find((pr) => pr.id === input.productId);
  if (!saleProduct) errors.productId = "Product is required";
  else if (saleProduct.status !== "active") errors.productId = "This product is inactive and cannot be sold";
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
    const product = current.products.find((p) => p.id === input.productId);
    if (!product) errors.productId = "Select a product";
    else if (product.status !== "active") errors.productId = "This product is inactive — reactivate it before adding stock";
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
    const product = current.products.find((p) => p.id === input.productId);
    if (!product) errors.productId = "Select a product";
    else if (product.status !== "active") errors.productId = "This product is inactive and cannot be requested";
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

// ---------- products ----------
export type ProductInput = { name: string; sku: string; category: string; unit: string; unitPrice: number; unitCost: number; lowStockThreshold: number; description?: string };
export function validateProduct(db: Db, input: ProductInput, editingId?: string) {
  const errors: FieldErrors = {};
  const sku = input.sku.trim().toUpperCase();
  if (!input.name.trim()) errors.name = "Enter a product name";
  if (!sku) errors.sku = "Enter a SKU";
  else if (db.products.some((p) => p.id !== editingId && p.tenantId === db.tenant.id && p.sku.toUpperCase() === sku)) errors.sku = "This SKU is already used by another product";
  if (!input.category.trim()) errors.category = "Enter a category";
  if (!input.unit.trim()) errors.unit = "Select a unit";
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) errors.unitPrice = "Enter a selling price above zero";
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) errors.unitCost = "Enter a unit cost of zero or more";
  else if (input.unitCost > input.unitPrice) errors.unitCost = "Unit cost cannot exceed selling price";
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) errors.threshold = "Enter a whole number of zero or more";
  return errors;
}
const clean = (input: ProductInput) => ({
  name: input.name.trim(), sku: input.sku.trim().toUpperCase(), category: input.category.trim(), unit: input.unit.trim(),
  unitPrice: input.unitPrice, unitCost: input.unitCost, lowStockThreshold: input.lowStockThreshold,
  ...(input.description?.trim() ? { description: input.description.trim() } : {}),
});

export const mockProductService = {
  /** Adds to the shared catalogue and opens zero-stock inventory records in the actor's branches. */
  async create(input: ProductInput, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canManageProducts) return { ok: false, errors: { form: "You cannot add products" } };
    const errors = validateProduct(current, input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const at = nowOnReferenceDay(current);
    const product: Product = { id: `product-${String(current.products.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`, tenantId: current.tenant.id, ...clean(input), status: "active", createdAt: at, updatedAt: at };
    const branchIds = scope.branchIds ?? current.branches.filter((b) => b.status === "active").map((b) => b.id);
    const records: InventoryRecord[] = branchIds.map((branchId, i) => ({ id: `inv-${product.id}-${i}`, tenantId: current.tenant.id, branchId, productId: product.id, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: input.lowStockThreshold, reorderLevel: input.lowStockThreshold * 2, lastUpdated: at }));
    setDb((d) => ({ ...d, products: [...d.products, product], inventory: [...d.inventory, ...records], activities: [activity(d, actorId, "Product created", `${product.name} · ${product.sku}`), ...d.activities] }));
    return { ok: true, data: product };
  },
  /** Edits catalogue fields; branch thresholds still on the old default follow the new default. */
  async update(id: string, input: ProductInput, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    if (!getAccessScope(current, actorId).canManageProducts) return { ok: false, errors: { form: "You cannot edit products" } };
    const existing = current.products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: { form: "Product not found" } };
    const errors = validateProduct(current, input, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const { description: _drop, ...rest } = existing;
    const product: Product = { ...rest, ...clean(input), updatedAt: nowOnReferenceDay(current) };
    setDb((d) => ({
      ...d, products: d.products.map((p) => (p.id === id ? product : p)),
      inventory: d.inventory.map((i) => (i.productId === id && i.lowStockThreshold === existing.lowStockThreshold ? { ...i, lowStockThreshold: product.lowStockThreshold } : i)),
      activities: [activity(d, actorId, "Product edited", `${product.name} · ${product.sku}`), ...d.activities],
    }));
    return { ok: true, data: product };
  },
  /** Soft status change — history (sales, requests, movements) stays intact. */
  async setStatus(id: string, status: ProductStatus, actorId: string): Promise<Result<Product>> {
    await latency();
    const current = getDb();
    if (!getAccessScope(current, actorId).canManageProducts) return { ok: false, errors: { form: "You cannot change product status" } };
    const existing = current.products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: { form: "Product not found" } };
    const product: Product = { ...existing, status, updatedAt: nowOnReferenceDay(current) };
    setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? product : p)), activities: [activity(d, actorId, status === "active" ? "Product activated" : "Product deactivated", `${product.name} · ${product.sku}`), ...d.activities] }));
    return { ok: true, data: product };
  },
};

// ---------- targets ----------
export type TargetInput = { repId: string; month: string; amount: number };
export function validateTarget(db: Db, input: TargetInput, actorId: string, editingId?: string) {
  const errors: FieldErrors = {};
  const scope = getAccessScope(db, actorId);
  const rep = db.users.find((u) => u.id === input.repId);
  if (!rep) errors.repId = "Select a sales representative";
  else if (rep.role !== "sales_rep") errors.repId = "Targets can only be set for sales representatives";
  else if (rep.status !== "active") errors.repId = "This sales representative is inactive";
  else if (!rep.branchId) errors.repId = "This sales representative has no branch";
  else if (scope.branchIds && !scope.branchIds.includes(rep.branchId)) errors.repId = "You can only set targets for your branch";
  if (!/^\d{4}-\d{2}$/.test(input.month)) errors.month = "Select a month";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Enter a target above zero";
  if (!errors.repId && !errors.month && db.targets.some((t) => t.id !== editingId && t.scope === "rep" && t.userId === input.repId && t.month === input.month))
    errors.repId = "This rep already has a target for that month — edit it instead";
  return errors;
}
export const mockTargetService = {
  async create(input: TargetInput, actorId: string): Promise<Result<Target>> {
    await latency();
    const current = getDb();
    if (!getAccessScope(current, actorId).canManageTargets) return { ok: false, errors: { form: "You cannot set targets" } };
    const errors = validateTarget(current, input, actorId);
    if (Object.keys(errors).length) return { ok: false, errors };
    const rep = current.users.find((u) => u.id === input.repId)!;
    const at = nowOnReferenceDay(current);
    const target: Target = { id: `target-${rep.id}-${input.month}`, tenantId: current.tenant.id, scope: "rep", branchId: rep.branchId!, userId: rep.id, month: input.month, amount: Math.round(input.amount), createdAt: at, updatedAt: at };
    setDb((d) => ({ ...d, targets: [...d.targets, target], activities: [activity(d, actorId, "Target created", `${rep.name} · ${input.month} · ₦${target.amount.toLocaleString("en-NG")}`), ...d.activities] }));
    return { ok: true, data: target };
  },
  /** Changes only the amount — sales history is never touched. */
  async update(id: string, amount: number, actorId: string): Promise<Result<Target>> {
    await latency();
    const current = getDb();
    const existing = current.targets.find((t) => t.id === id && t.scope === "rep");
    if (!existing) return { ok: false, errors: { form: "Target not found" } };
    if (!getAccessScope(current, actorId).canManageTargets) return { ok: false, errors: { form: "You cannot edit targets" } };
    const errors = validateTarget(current, { repId: existing.userId ?? "", month: existing.month, amount }, actorId, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const target: Target = { ...existing, amount: Math.round(amount), updatedAt: nowOnReferenceDay(current) };
    const rep = current.users.find((u) => u.id === existing.userId)?.name;
    setDb((d) => ({ ...d, targets: d.targets.map((t) => (t.id === id ? target : t)), activities: [activity(d, actorId, "Target updated", `${rep} · ${existing.month} · ₦${existing.amount.toLocaleString("en-NG")} → ₦${target.amount.toLocaleString("en-NG")}`), ...d.activities] }));
    return { ok: true, data: target };
  },
};

// Swap points for the live API.
// ---------- team (views over db.users; never deletes) ----------
export type TeamMemberInput = { name: string; email: string; role: Role; branchId: string; status: UserStatus };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateTeamMember(db: Db, input: TeamMemberInput, actorId: string, editingId?: string) {
  const scope = getAccessScope(db, actorId);
  const e: FieldErrors = {};
  const existing = editingId ? db.users.find((u) => u.id === editingId) : undefined;
  if (!scope.canManageTeam) e.form = "You don't have permission to manage the team.";
  if (existing && !canEditMember(scope, existing)) e.form = "You can't edit this team member.";
  if (input.name.trim().length < 2) e.name = "Enter the member's full name.";
  const email = input.email.trim().toLowerCase();
  if (!email) e.email = "Email is required.";
  else if (!EMAIL.test(email)) e.email = "Enter a valid email address.";
  else if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== editingId)) e.email = "Someone on the team already uses this email.";
  const roleUnchanged = existing?.role === input.role;
  if (!assignableRoles(scope).includes(input.role) && !roleUnchanged) e.role = "You can't assign this role.";
  const branch = db.branches.find((b) => b.id === input.branchId);
  if (roleNeedsBranch(input.role) && !input.branchId) e.branchId = "Select the branch this member works at.";
  if (input.branchId) {
    if (!branch || branch.tenantId !== db.tenant.id) e.branchId = "Select a valid branch.";
    else if (scope.branchIds && !scope.branchIds.includes(branch.id)) e.branchId = "You can only assign members to your own branch.";
    else if (branch.status !== "active" && input.status === "active") e.branchId = "This branch is inactive.";
    else if (input.role === "manager" && branch.managerId && branch.managerId !== editingId && db.users.find((u) => u.id === branch.managerId)?.status === "active")
      e.branchId = `${branch.name} already has a manager.`;
  }
  if (!["active", "inactive", "pending"].includes(input.status)) e.status = "Choose a valid status.";
  return e;
}
const branchManager = (d: Db, role: Role, branchId: string | null) =>
  roleNeedsBranch(role) && branchId ? d.branches.find((b) => b.id === branchId)?.managerId ?? null : null;
/** Keep branch.managerId in sync when a manager is (re)assigned. */
function syncBranches(d: Db, user: User, previous?: User) {
  return d.branches.map((b) => {
    if (previous?.role === "manager" && b.managerId === user.id && (user.role !== "manager" || b.id !== user.branchId)) return { ...b, managerId: null };
    if (user.role === "manager" && b.id === user.branchId && !b.managerId) return { ...b, managerId: user.id };
    return b;
  });
}

export const mockTeamService = {
  async create(input: TeamMemberInput, actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    const errors = validateTeamMember(db, input, actorId);
    if (Object.keys(errors).length) return { ok: false, errors };
    const n = db.users.reduce((m, u) => Math.max(m, Number(u.id.slice(5)) || 0), 0) + 1;
    const branchId = input.branchId || null;
    const user: User = { id: `user-${String(n).padStart(3, "0")}`, tenantId: db.tenant.id, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, branchId, managerId: branchManager(db, input.role, branchId), status: input.status, createdAt: nowOnReferenceDay(db) };
    setDb((d) => ({ ...d, users: [...d.users, user], branches: syncBranches(d, user), activities: [activity(d, actorId, "Team member created", `${user.name} · ${input.role.replace("_", " ")}`), ...d.activities] }));
    return { ok: true, data: user };
  },
  async update(id: string, input: TeamMemberInput, actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    const prev = db.users.find((u) => u.id === id);
    if (!prev) return { ok: false, errors: { form: "Team member not found." } };
    const errors = validateTeamMember(db, input, actorId, id);
    if (Object.keys(errors).length) return { ok: false, errors };
    const branchId = input.branchId || null;
    const user: User = { ...prev, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, branchId, managerId: branchManager(db, input.role, branchId), status: input.status };
    const branchName = (bid: string | null) => db.branches.find((b) => b.id === bid)?.name ?? "Unassigned";
    setDb((d) => {
      const acts = [activity(d, actorId, "Team member edited", user.name)];
      if (prev.role !== user.role) acts.push(activity(d, actorId, "Role changed", `${user.name} · ${prev.role.replace("_", " ")} → ${user.role.replace("_", " ")}`));
      if (prev.branchId !== user.branchId) acts.push(activity(d, actorId, "Branch assignment changed", `${user.name} · ${branchName(prev.branchId)} → ${branchName(user.branchId)}`));
      if (prev.status !== user.status) acts.push(activity(d, actorId, user.status === "active" ? "Team member activated" : "Team member deactivated", user.name));
      return { ...d, users: d.users.map((u) => (u.id === id ? user : u)), branches: syncBranches(d, user, prev), activities: [...acts.reverse(), ...d.activities] };
    });
    return { ok: true, data: user };
  },
  /** Soft (de)activation — sales, targets, requests and movements keep referencing the user. */
  async setStatus(id: string, status: "active" | "inactive", actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    const prev = db.users.find((u) => u.id === id);
    if (!prev || !canEditMember(getAccessScope(db, actorId), prev)) return { ok: false, errors: { form: "You can't change this member's status." } };
    const user = { ...prev, status };
    setDb((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? user : u)), activities: [activity(d, actorId, status === "active" ? "Team member activated" : "Team member deactivated", user.name), ...d.activities] }));
    return { ok: true, data: user };
  },
};

export const teamService = mockTeamService;
export const targetService = mockTargetService;
export const productService = mockProductService;
export const branchService = mockBranchService;
export const salesService = mockSalesService;
export const stockRequestService = mockStockRequestService;
export const inventoryService = mockInventoryService;

/* ---------------- Settings ---------------- */
export type GeneralSettingsInput = { name: string; businessEmail: string; phone: string; timezone: string };
export type OrganizationInput = { legalName: string };
export type PreferencesInput = { dateFormat: DateFormatPref; defaultReportPeriod: ReportPeriodPref };
export type PasswordInput = { current: string; next: string; confirm: string };
export type SettingsErrors = Partial<Record<"name" | "businessEmail" | "phone" | "timezone" | "legalName" | "current" | "next" | "confirm" | "form", string>>;
type SettingsResult<T> = { ok: true; data: T } | { ok: false; errors: SettingsErrors };

export const defaultPreferences = (userId: string): UserPreference => ({ userId, dateFormat: "MMM D, YYYY", defaultReportPeriod: "month", updatedAt: "" });
export const getPreferences = (db: Db, userId: string) => db.preferences.find((p) => p.userId === userId) ?? defaultPreferences(userId);
export const timezones = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London"];
const fieldLabel: Record<string, string> = { name: "business name", businessEmail: "business email", phone: "phone number", timezone: "timezone", legalName: "organization name" };

export function validatePassword(input: PasswordInput): SettingsErrors {
  const e: SettingsErrors = {};
  if (!input.current) e.current = "Enter your current password";
  if (!input.next) e.next = "Enter a new password";
  else if (input.next.length < 8 || !/[A-Za-z]/.test(input.next) || !/\d/.test(input.next)) e.next = "Use at least 8 characters with a letter and a number";
  else if (input.next === input.current) e.next = "New password must be different from the current one";
  if (!input.confirm) e.confirm = "Confirm your new password";
  else if (input.confirm !== input.next) e.confirm = "Passwords do not match";
  return e;
}

export const settingsService = {
  /** Owner only: business profile shown across the app. */
  async updateGeneral(input: GeneralSettingsInput, actorId: string): Promise<SettingsResult<GeneralSettingsInput>> {
    await latency();
    const db = getDb();
    if (!getAccessScope(db, actorId).canManageSettings) return { ok: false, errors: { form: "Only the business owner can change these settings." } };
    const e: SettingsErrors = {};
    if (!input.name.trim()) e.name = "Business name is required";
    if (!/^\S+@\S+\.\S+$/.test(input.businessEmail.trim())) e.businessEmail = "Enter a valid email";
    if (!/^\+?[\d\s-]{7,}$/.test(input.phone.trim())) e.phone = "Enter a valid phone number";
    if (!timezones.includes(input.timezone)) e.timezone = "Select a timezone";
    if (Object.keys(e).length) return { ok: false, errors: e };
    const changed = (Object.keys(input) as (keyof GeneralSettingsInput)[]).filter((k) => input[k].trim() !== String(db.tenant[k]));
    if (!changed.length) return { ok: true, data: input };
    setDb((d) => ({ ...d, tenant: { ...d.tenant, name: input.name.trim(), businessEmail: input.businessEmail.trim(), phone: input.phone.trim(), timezone: input.timezone, updatedAt: nowOnReferenceDay(d) },
      activities: [activity(d, actorId, "Settings updated", `Updated ${changed.map((k) => fieldLabel[k]).join(", ")}`, { branchId: null, entityId: d.tenant.id }), ...d.activities] }));
    return { ok: true, data: input };
  },
  async updateOrganization(input: OrganizationInput, actorId: string): Promise<SettingsResult<OrganizationInput>> {
    await latency();
    const db = getDb();
    if (!getAccessScope(db, actorId).canManageSettings) return { ok: false, errors: { form: "Only the business owner can change organization details." } };
    if (!input.legalName.trim()) return { ok: false, errors: { legalName: "Organization name is required" } };
    if (input.legalName.trim() === db.tenant.legalName) return { ok: true, data: input };
    setDb((d) => ({ ...d, tenant: { ...d.tenant, legalName: input.legalName.trim(), updatedAt: nowOnReferenceDay(d) },
      activities: [activity(d, actorId, "Settings updated", "Updated organization name", { branchId: null, entityId: d.tenant.id }), ...d.activities] }));
    return { ok: true, data: input };
  },
  /** Any signed-in user, for their own account only. */
  async updatePreferences(input: PreferencesInput, actorId: string): Promise<SettingsResult<UserPreference>> {
    await latency();
    const pref: UserPreference = { userId: actorId, ...input, updatedAt: nowOnReferenceDay(getDb()) };
    setDb((d) => ({ ...d, preferences: [...d.preferences.filter((p) => p.userId !== actorId), pref],
      activities: [activity(d, actorId, "Preferences updated", "Updated date format and default report period", { entityId: actorId }), ...d.activities] }));
    return { ok: true, data: pref };
  },
  /**
   * Demo mode: there is no sign-in system yet, so nothing is stored. When real accounts are added,
   * this calls the auth provider's password update — passwords are never written to app data.
   */
  async changePassword(input: PasswordInput, actorId: string): Promise<SettingsResult<true>> {
    await latency();
    const e = validatePassword(input);
    if (Object.keys(e).length) return { ok: false, errors: e };
    setDb((d) => ({ ...d, activities: [activity(d, actorId, "Password changed", "Changed account password", { entityId: actorId }), ...d.activities] }));
    return { ok: true, data: true };
  },
};

/** Demo sign-in: switching the viewed user records a Logout and a Login. */
export const sessionService = {
  switchUser(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDb((d) => ({ ...d, activities: [activity(d, toId, "Login", "Signed in"), activity(d, fromId, "Logout", "Signed out"), ...d.activities] }));
  },
};
