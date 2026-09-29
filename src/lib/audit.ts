/**
 * Role-aware audit selector. Sales reps and storekeepers only ever receive their own actions,
 * derived from the records they authored (sales, requests, movements) plus logged activities.
 */
import type { Db } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { formatNaira } from "@/lib/format";
import { saleTotal } from "@/lib/calculations";

export type AuditKind = "sale" | "request" | "review" | "stock" | "product";
export type AuditEntry = { id: string; at: string; kind: AuditKind; action: string; subject: string; link?: { requestId?: string; inventoryId?: string } };

export function getAuditLog(db: Db, scope: AccessScope): AuditEntry[] {
  const me = scope.user.id;
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Product";
  const out: AuditEntry[] = [];
  if (scope.user.role === "sales_rep") {
    for (const s of db.sales) if (s.salesRepId === me)
      out.push({ id: `a-${s.id}`, at: s.createdAt, kind: "sale", action: s.status === "voided" ? "Sale voided" : "Recorded sale", subject: `${s.code} · ${s.quantity} × ${product(s.productId)} · ${formatNaira(saleTotal(s))}` });
    for (const r of db.stockRequests) if (r.repId === me)
      out.push({ id: `a-${r.id}`, at: r.requestedAt, kind: "request", action: "Submitted stock request", subject: `${r.id} · ${r.quantityRequested} × ${product(r.productId)}`, link: { requestId: r.id } });
  } else if (scope.user.role === "storekeeper") {
    for (const m of db.inventoryMovements) if (m.performedBy === me && m.type !== "sale") {
      const inv = db.inventory.find((i) => i.branchId === m.branchId && i.productId === m.productId);
      const action = m.type === "stock_added" ? "Added stock" : m.type === "stock_issued" ? "Issued stock" : "Adjusted stock";
      out.push({ id: `a-${m.id}`, at: m.createdAt, kind: "stock", action, subject: `${product(m.productId)} · ${m.quantity > 0 ? "+" : ""}${m.quantity} units${m.referenceId ? ` · ${m.referenceId}` : ""}`, ...(inv ? { link: { inventoryId: inv.id } } : {}) });
    }
    for (const r of db.stockRequests) {
      if (r.approvedBy === me && r.approvedAt) out.push({ id: `ap-${r.id}`, at: r.approvedAt, kind: "review", action: "Approved stock request", subject: `${r.id} · ${r.quantityApproved ?? r.quantityRequested} × ${product(r.productId)}`, link: { requestId: r.id } });
      if (r.status === "rejected" && r.processedBy === me && r.rejectedAt) out.push({ id: `rj-${r.id}`, at: r.rejectedAt, kind: "review", action: "Rejected stock request", subject: `${r.id} · ${r.rejectionReason ?? ""}`, link: { requestId: r.id } });
    }
    for (const a of db.activities) if (a.actorId === me && a.action.startsWith("Product "))
      out.push({ id: a.id, at: a.createdAt, kind: "product", action: a.action, subject: a.subject });
  } else {
    const users = new Set(db.users.filter((u) => !scope.branchIds || (u.branchId && scope.branchIds.includes(u.branchId))).map((u) => u.id));
    for (const a of db.activities) if (!scope.branchIds || users.has(a.actorId))
      out.push({ id: a.id, at: a.createdAt, kind: "product", action: a.action, subject: a.subject });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
