import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FilterSelect, StockStatusBadge } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { stockRequestService, type FieldErrors } from "@/services/services";
import type { AccessScope } from "@/lib/session";
import { findInventory, getAvailable, getInventoryStatus } from "@/lib/inventory-calculations";
import { formatUnits } from "@/lib/format";

export function NewRequestDialog({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope }) {
  const db = useDb();
  const branchId = scope.user.branchId ?? "";
  const branch = db.branches.find((b) => b.id === branchId);
  const [form, setForm] = useState({ productId: "", quantity: "", note: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm({ productId: "", quantity: "", note: "" }); setErrors({}); } }, [open]);

  const stocked = db.products.filter((p) => findInventory(db, branchId, p.id));
  const inv = form.productId ? findInventory(db, branchId, form.productId) : null;
  const available = inv ? getAvailable(inv) : 0;
  const qty = Number(form.quantity);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await stockRequestService.create({ branchId, productId: form.productId, quantity: qty, note: form.note }, scope.user.id);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    toast.success("Stock request submitted.", { description: `${r.data.id} is pending storekeeper review` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New stock request</DialogTitle><DialogDescription className="text-xs">Requests are reviewed by your branch storekeeper. Stock is issued only after approval.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="req-branch" className="text-xs">Branch</Label><Input id="req-branch" value={branch?.name ?? "No branch assigned"} readOnly disabled className="mt-1.5 h-10" /><FieldError message={errors.branchId} /></div>
          <div><Label className="text-xs">Product *</Label><div className="mt-1.5"><FilterSelect label="Product" className="w-full" value={form.productId || "none"} onChange={(v) => setForm((f) => ({ ...f, productId: v === "none" ? "" : v }))} options={[{ value: "none", label: "Select product" }, ...stocked.map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))]} /></div><FieldError message={errors.productId} /></div>
          {inv && <div className="flex items-center justify-between rounded-md bg-muted p-3 text-xs"><span>Available stock: <strong data-testid="request-available">{formatUnits(available)}</strong></span><StockStatusBadge status={getInventoryStatus(inv)} /></div>}
          <div><Label htmlFor="req-qty" className="text-xs">Quantity *</Label><Input id="req-qty" type="number" inputMode="numeric" min={1} step={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="mt-1.5 h-10" /><FieldError message={errors.quantity} />
            {inv && qty > available && <p className="mt-1 text-[11px] text-warning">More than is currently available — the request may be partially fulfilled.</p>}</div>
          <div><Label htmlFor="req-note" className="text-xs">Note</Label><Textarea id="req-note" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="mt-1.5 text-sm" placeholder="Customer order, display stock…" /></div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Submit request</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
