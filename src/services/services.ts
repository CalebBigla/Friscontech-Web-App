/**
 * Mock services with async, API-shaped signatures. Replace mockBranchService / mockSalesService
 * with fetch-based implementations of the same interfaces to go live.
 */
import type { ApprovalRequest, DateFormatPref, ReportPeriodPref, UserPreference, Role, User, UserStatus, Activity, Branch, BranchStatus, Db, InventoryMovement, InventoryRecord, Product, ProductStatus, Sale, StockRequest, Target } from "@/data/mock-db";
import { findInventory, getAvailable, getRequestOutstanding } from "@/lib/inventory-calculations";
import { getAccessScope } from "@/lib/session";
import { assignableRoles, canEditMember, roleNeedsBranch } from "@/lib/team";
import { getDb, setDb } from "@/services/mock-store";
import { entityFromAction } from "@/data/auditLogs";

export type FieldErrors = Partial<Record<"name" | "code" | "location" | "email" | "address" | "phone" | "managerId" | "form" | "branchId" | "salesRepId" | "productId" | "quantity" | "unitPrice" | "saleDate" | "note" | "reason" | "sku" | "category" | "unit" | "unitCost" | "threshold" | "description" | "repId" | "month" | "amount" | "role" | "status" | "items" | "emergencyReason", string>> & { itemErrors?: Record<number, Partial<Record<"productId" | "quantity", string>>> };
export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };
export type BranchInput = { name: string; code: string; location: string; address: string; phone: string; email: string; managerId: string; status: BranchStatus };
export type SaleInput = { branchId: string; salesRepId: string; productId: string; quantity: number; unitPrice: number; saleDate: string };

const latency = () => new Promise((r) => setTimeout(r, 350));
function nowOnReferenceDay(db: Db) {
  const d = new Date();
  return `${db.tenant.referenceDate}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}
/** The single audit writer: every module appends to db.activities through here. Never pass secrets. */
export function createAuditLog(db: Db, actorId: string, action: string, subject: string, ref: { entityId?: string; branchId?: string | null; productId?: string; emergency?: boolean } = {}): Activity {
  const branchId = ref.branchId === undefined ? db.users.find((u) => u.id === actorId)?.branchId ?? undefined : ref.branchId ?? undefined;
  const entityId = ref.entityId ?? subject.match(/\b(SR-\d+|SAL-\d+)\b/)?.[1];
  const metadata = { ...(branchId ? { branchId } : {}), ...(ref.productId ? { productId: ref.productId } : {}) };
  return {
    id: `act-${db.activities.length + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId: db.tenant.id, action, subject, actorId, createdAt: nowOnReferenceDay(db),
    entity: entityFromAction(action), ...(entityId ? { entityId } : {}), ...(ref.emergency ? { emergency: true } : {}), ...(Object.keys(metadata).length ? { metadata } : {}),
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

export type AddStockInput = { branchId: string; productId: string; quantity: number; note: string; emergency?: boolean; emergencyReason?: string };
const labels = (d: Db, branchId: string, productId: string) => `${d.branches.find((b) => b.id === branchId)?.name} · ${d.products.find((p) => p.id === productId)?.name}`;
const nextApprovalId = (d: Db) => `APR-${Math.max(2000, ...d.approvals.map((a) => Number(a.id.split("-")[1]) || 0)) + 1}`;

export const mockInventoryService = {
  /**
   * Storekeeper stock additions need Manager approval before they count.
   * Emergency additions are applied immediately and queued for Manager review afterwards.
   */
  async addStock(input: AddStockInput, actorId: string): Promise<Result<ApprovalRequest>> {
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
    if (input.emergency && (input.emergencyReason ?? "").trim().length < 5) errors.emergencyReason = "Explain why this addition can't wait for approval";
    if (Object.keys(errors).length) return { ok: false, errors };
    const at = nowOnReferenceDay(current);
    const approval: ApprovalRequest = {
      id: nextApprovalId(current), tenantId: current.tenant.id, type: "stock_addition", status: "pending", branchId: input.branchId,
      requestedBy: actorId, requestedAt: at, productId: input.productId, quantity: input.quantity,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(input.emergency ? { emergency: true, emergencyReason: input.emergencyReason!.trim(), appliedAt: at } : {}),
    };
    setDb((d) => {
      const base = input.emergency
        ? applyInventoryChange(d, { branchId: input.branchId, productId: input.productId, delta: input.quantity, type: "stock_added", referenceType: "manual", referenceId: approval.id, performedBy: actorId, at, note: `EMERGENCY: ${approval.emergencyReason}` })
        : d;
      const log = input.emergency
        ? activity(d, actorId, "Emergency stock added", `${approval.id} · ${labels(d, input.branchId, input.productId)} · +${input.quantity} · ${approval.emergencyReason}`, { entityId: approval.id, branchId: input.branchId, productId: input.productId, emergency: true })
        : activity(d, actorId, "Stock addition submitted", `${approval.id} · ${labels(d, input.branchId, input.productId)} · +${input.quantity} awaiting manager approval`, { entityId: approval.id, branchId: input.branchId, productId: input.productId });
      return { ...base, approvals: [approval, ...d.approvals], activities: [log, ...d.activities] };
    });
    return { ok: true, data: approval };
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

export type StockRequestItem = { productId: string; quantity: number };
export const mockStockRequestService = {
  /** One submission, several products: each item becomes its own request row sharing a batchId, so approval/fulfillment stay per product. */
  async createBatch(input: { branchId: string; items: StockRequestItem[]; note: string }, actorId: string): Promise<Result<StockRequest[]>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    if (!scope.canCreateRequests) return { ok: false, errors: { form: "Only sales representatives can submit stock requests" } };
    const errors: FieldErrors = {};
    const itemErrors: NonNullable<FieldErrors["itemErrors"]> = {};
    const branch = current.branches.find((b) => b.id === input.branchId);
    if (!branch || branch.status !== "active") errors.branchId = "Select an active branch";
    else if (scope.user.branchId !== branch.id) errors.branchId = "You can only request stock for your own branch";
    if (!input.items.length) errors.items = "Add at least one product";
    const seen = new Set<string>();
    input.items.forEach((it, i) => {
      const e: Partial<Record<"productId" | "quantity", string>> = {};
      const product = current.products.find((p) => p.id === it.productId);
      if (!product) e.productId = "Select a product";
      else if (product.status !== "active") e.productId = "This product is inactive and cannot be requested";
      else if (seen.has(it.productId)) e.productId = "This product is already in the request";
      else if (branch && !findInventory(current, branch.id, it.productId)) e.productId = "This branch does not stock this product";
      if (it.productId) seen.add(it.productId);
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) e.quantity = "Enter a whole number greater than zero";
      if (Object.keys(e).length) itemErrors[i] = e;
    });
    if (Object.keys(itemErrors).length) { errors.itemErrors = itemErrors; errors.items = "Fix the highlighted items"; }
    if (Object.keys(errors).length) return { ok: false, errors };
    const max = Math.max(1000, ...current.stockRequests.map((r) => Number(r.id.split("-")[1]) || 0));
    const at = nowOnReferenceDay(current);
    const batchId = input.items.length > 1 ? `SRB-${max + 1}` : undefined;
    const reqs: StockRequest[] = input.items.map((it, i) => ({
      id: `SR-${max + 1 + i}`, tenantId: current.tenant.id, branchId: input.branchId, repId: actorId, productId: it.productId,
      quantityRequested: it.quantity, status: "pending", priority: "Normal", requestedAt: at,
      ...(input.note.trim() ? { note: input.note.trim() } : {}), ...(batchId ? { batchId } : {}),
    }));
    setDb((d) => ({ ...d, stockRequests: [...reqs, ...d.stockRequests], activities: [...reqs.map((r) => activity(d, actorId, "Stock request submitted", `${r.id} · ${labels(d, r.branchId, r.productId)} · ${r.quantityRequested} units${batchId ? ` · ${batchId}` : ""}`)).reverse(), ...d.activities] }));
    return { ok: true, data: reqs };
  },
  /** Rep confirms they received fulfilled stock: Fulfilled → Acknowledged. */
  async acknowledge(id: string, actorId: string): Promise<Result<StockRequest>> {
    await latency();
    const current = getDb();
    const scope = getAccessScope(current, actorId);
    const req = current.stockRequests.find((r) => r.id === id);
    if (!req) return { ok: false, errors: { form: "Stock request not found" } };
    if (!scope.canAcknowledgeStock || req.repId !== actorId) return { ok: false, errors: { form: "Only the requesting sales rep can acknowledge receipt" } };
    if (req.status !== "fulfilled") return { ok: false, errors: { form: "Only fulfilled requests can be acknowledged" } };
    if (req.acknowledgedAt) return { ok: false, errors: { form: "Receipt was already acknowledged" } };
    const at = nowOnReferenceDay(current);
    setDb((d) => ({ ...updateRequest(d, id, { acknowledgedAt: at, acknowledgedBy: actorId }), activities: [activity(d, actorId, "Stock request acknowledged", `${id} · ${labels(d, req.branchId, req.productId)} · ${req.quantityFulfilled ?? 0} units received`, { entityId: id, branchId: req.branchId }), ...d.activities] }));
    return { ok: true, data: getDb().stockRequests.find((r) => r.id === id)! };
  },
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
    const ps = getAccessScope(current, actorId);
    if (status === "inactive" ? !ps.canDeactivateProducts : !(ps.canDeactivateProducts || ps.canManageProducts))
      return { ok: false, errors: { form: ps.canManageProducts ? "Deactivation needs a manager's approval — send a request instead" : "You cannot change product status" } };
    const existing = current.products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: { form: "Product not found" } };
    const product: Product = { ...existing, status, updatedAt: nowOnReferenceDay(current) };
    setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? product : p)), activities: [activity(d, actorId, status === "active" ? "Product activated" : "Product deactivated", `${product.name} · ${product.sku}`), ...d.activities] }));
    return { ok: true, data: product };
  },
};

/** Storekeeper asks their Manager to deactivate a product. */
export async function requestProductDeactivation(productId: string, reason: string, actorId: string): Promise<Result<ApprovalRequest>> {
  await latency();
  const current = getDb();
  const scope = getAccessScope(current, actorId);
  if (!scope.canManageProducts || scope.canDeactivateProducts) return { ok: false, errors: { form: "You cannot request product deactivation" } };
  const product = current.products.find((p) => p.id === productId);
  if (!product) return { ok: false, errors: { form: "Product not found" } };
  if (product.status !== "active") return { ok: false, errors: { form: "This product is already inactive" } };
  if (current.approvals.some((a) => a.type === "product_deactivation" && a.status === "pending" && a.productId === productId)) return { ok: false, errors: { form: "A deactivation request for this product is already pending" } };
  if (reason.trim().length < 3) return { ok: false, errors: { reason: "Give a reason for the manager" } };
  const approval: ApprovalRequest = { id: nextApprovalId(current), tenantId: current.tenant.id, type: "product_deactivation", status: "pending", branchId: scope.user.branchId, requestedBy: actorId, requestedAt: nowOnReferenceDay(current), productId, note: reason.trim() };
  setDb((d) => ({ ...d, approvals: [approval, ...d.approvals], activities: [activity(d, actorId, "Product deactivation requested", `${approval.id} · ${product.name} · ${approval.note}`, { entityId: approval.id, productId }), ...d.activities] }));
  return { ok: true, data: approval };
}

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
  /** Owner only — managers go through requestMember so the Owner approves new accounts. */
  async create(input: TeamMemberInput, actorId: string): Promise<Result<User>> {
    await latency();
    const db = getDb();
    if (getAccessScope(db, actorId).user.role !== "owner") return { ok: false, errors: { form: "New team members need the Owner's approval." } };
    const errors = validateTeamMember(db, input, actorId);
    if (Object.keys(errors).length) return { ok: false, errors };
    const n = db.users.reduce((m, u) => Math.max(m, Number(u.id.slice(5)) || 0), 0) + 1;
    const branchId = input.branchId || null;
    const user: User = { id: `user-${String(n).padStart(3, "0")}`, tenantId: db.tenant.id, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, branchId, managerId: branchManager(db, input.role, branchId), status: input.status, createdAt: nowOnReferenceDay(db) };
    setDb((d) => ({ ...d, users: [...d.users, user], branches: syncBranches(d, user), activities: [activity(d, actorId, "Team member created", `${user.name} · ${input.role.replace("_", " ")}`), ...d.activities] }));
    return { ok: true, data: user };
  },
  /** Manager proposes a new member; nothing is added to the team until the Owner approves. */
  async requestMember(input: TeamMemberInput, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const errors = validateTeamMember(db, { ...input, status: "pending" }, actorId);
    const email = input.email.trim().toLowerCase();
    if (!errors.email && db.approvals.some((a) => a.type === "team_member" && a.status === "pending" && a.member?.email === email)) errors.email = "A request for this email is already waiting for approval.";
    if (Object.keys(errors).length) return { ok: false, errors };
    const approval: ApprovalRequest = { id: nextApprovalId(db), tenantId: db.tenant.id, type: "team_member", status: "pending", branchId: input.branchId || null, requestedBy: actorId, requestedAt: nowOnReferenceDay(db), member: { name: input.name.trim(), email, role: input.role, branchId: input.branchId || null } };
    setDb((d) => ({ ...d, approvals: [approval, ...d.approvals], activities: [activity(d, actorId, "Team member request submitted", `${approval.id} · ${approval.member!.name} · ${input.role.replace("_", " ")}`, { entityId: approval.id }), ...d.activities] }));
    return { ok: true, data: approval };
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

// ---------- approvals (Storekeeper → Manager, Manager → Owner) ----------
export function canReviewApproval(db: Db, actorId: string, a: ApprovalRequest) {
  const scope = getAccessScope(db, actorId);
  if (!scope.canReviewApprovals || a.requestedBy === actorId) return false;
  if (scope.user.role === "owner") return true;
  return a.type !== "team_member" && !!a.branchId && !!scope.branchIds?.includes(a.branchId);
}
export const mockApprovalService = {
  async approve(id: string, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const a = db.approvals.find((x) => x.id === id);
    if (!a) return { ok: false, errors: { form: "Request not found" } };
    if (!canReviewApproval(db, actorId, a)) return { ok: false, errors: { form: "You can't review this request" } };
    if (a.status !== "pending") return { ok: false, errors: { form: "This request was already reviewed" } };
    const at = nowOnReferenceDay(db);
    if (a.type === "product_deactivation" && db.products.find((p) => p.id === a.productId)?.status !== "active") return { ok: false, errors: { form: "This product is already inactive" } };
    if (a.type === "team_member" && db.users.some((u) => u.email.toLowerCase() === a.member?.email)) return { ok: false, errors: { form: "Someone on the team already uses this email" } };
    if (a.type === "stock_addition" && !a.emergency && db.products.find((p) => p.id === a.productId)?.status !== "active") return { ok: false, errors: { form: "This product is inactive — stock can't be added" } };
    const reviewed: ApprovalRequest = { ...a, status: "approved", reviewedBy: actorId, reviewedAt: at, ...(a.type === "stock_addition" && !a.emergency ? { appliedAt: at } : {}) };
    setDb((d) => {
      let next: Db = { ...d, approvals: d.approvals.map((x) => (x.id === id ? reviewed : x)) };
      let log: Activity;
      if (a.type === "stock_addition") {
        if (!a.emergency) next = applyInventoryChange(next, { branchId: a.branchId!, productId: a.productId!, delta: a.quantity!, type: "stock_added", referenceType: "manual", referenceId: a.id, performedBy: a.requestedBy, at, note: a.note ? `${a.note} · approved` : "Approved stock addition" });
        log = activity(d, actorId, a.emergency ? "Emergency stock addition reviewed" : "Stock addition approved", `${a.id} · ${labels(d, a.branchId!, a.productId!)} · +${a.quantity}`, { entityId: a.id, branchId: a.branchId, productId: a.productId!, emergency: !!a.emergency });
      } else if (a.type === "product_deactivation") {
        next = { ...next, products: next.products.map((p) => (p.id === a.productId ? { ...p, status: "inactive", updatedAt: at } : p)) };
        log = activity(d, actorId, "Product deactivation approved", `${a.id} · ${d.products.find((p) => p.id === a.productId)?.name}`, { entityId: a.id, productId: a.productId! });
      } else {
        const m = a.member!;
        const n = d.users.reduce((mx, u) => Math.max(mx, Number(u.id.slice(5)) || 0), 0) + 1;
        const user: User = { id: `user-${String(n).padStart(3, "0")}`, tenantId: d.tenant.id, name: m.name, email: m.email, role: m.role, branchId: m.branchId, managerId: branchManager(d, m.role, m.branchId), status: "active", createdAt: at };
        next = { ...next, users: [...next.users, user], branches: syncBranches(next, user) };
        log = activity(d, actorId, "Team member request approved", `${a.id} · ${m.name} · ${m.role.replace("_", " ")}`, { entityId: a.id, branchId: m.branchId });
      }
      return { ...next, activities: [log, ...d.activities] };
    });
    return { ok: true, data: reviewed };
  },
  async reject(id: string, reason: string, actorId: string): Promise<Result<ApprovalRequest>> {
    await latency();
    const db = getDb();
    const a = db.approvals.find((x) => x.id === id);
    if (!a) return { ok: false, errors: { form: "Request not found" } };
    if (!canReviewApproval(db, actorId, a)) return { ok: false, errors: { form: "You can't review this request" } };
    if (a.status !== "pending") return { ok: false, errors: { form: "This request was already reviewed" } };
    if (reason.trim().length < 3) return { ok: false, errors: { reason: "A rejection reason is required" } };
    const reviewed: ApprovalRequest = { ...a, status: "rejected", reviewedBy: actorId, reviewedAt: nowOnReferenceDay(db), rejectionReason: reason.trim() };
    const what = a.type === "stock_addition" ? (a.emergency ? "Emergency stock addition rejected" : "Stock addition rejected") : a.type === "product_deactivation" ? "Product deactivation rejected" : "Team member request rejected";
    setDb((d) => ({ ...d, approvals: d.approvals.map((x) => (x.id === id ? reviewed : x)), activities: [activity(d, actorId, what, `${a.id} · ${reason.trim()}`, { entityId: a.id, branchId: a.branchId, emergency: !!a.emergency }), ...d.activities] }));
    return { ok: true, data: reviewed };
  },
};
export const approvalService = mockApprovalService;
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
