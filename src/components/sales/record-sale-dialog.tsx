import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FilterSelect } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { salesService } from "@/services/services";
import type { AccessScope } from "@/lib/session";
import { formatNaira } from "@/lib/format";

type Form = { branchId: string; salesRepId: string; productId: string; quantity: string; unitPrice: string; saleDate: string };

export function RecordSaleDialog({ open, onOpenChange, scope, defaultBranchId }: { open: boolean; onOpenChange: (o: boolean) => void; scope: AccessScope; defaultBranchId?: string }) {
  const db = useDb();
  const [form, setForm] = useState<Form>({ branchId: "", salesRepId: "", productId: "", quantity: "1", unitPrice: "", saleDate: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const branches = db.branches.filter((b) => b.status === "active" && (!scope.branchIds || scope.branchIds.includes(b.id)));
  const reps = db.users.filter((x) => x.role === "sales_rep" && x.status === "active" && x.branchId === form.branchId && (!scope.repId || x.id === scope.repId));

  useEffect(() => {
    if (!open) return;
    const branchId = scope.branchIds?.[0] ?? (defaultBranchId && branches.some((b) => b.id === defaultBranchId) ? defaultBranchId : "");
    setErrors({});
    setForm({ branchId, salesRepId: scope.repId ?? "", productId: "", quantity: "1", unitPrice: "", saleDate: db.tenant.referenceDate });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const quantity = Number(form.quantity), unitPrice = Number(form.unitPrice);
  const total = Number.isFinite(quantity * unitPrice) && quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;
  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await salesService.record({ branchId: form.branchId, salesRepId: form.salesRepId, productId: form.productId, quantity, unitPrice, saleDate: form.saleDate }, scope.user.id);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error("Please fix the highlighted fields"); return; }
    toast.success(`Sale ${r.data.code} recorded`, { description: `${formatNaira(total)} added to revenue` });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Record sale</DialogTitle><DialogDescription className="text-xs">Total revenue is calculated automatically from quantity × unit price.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Branch *</Label><div className="mt-1.5"><FilterSelect label="Branch" className="w-full" value={form.branchId || "none"} onChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v, salesRepId: scope.repId ?? "" }))} options={[{ value: "none", label: "Select branch" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} /></div><FieldError message={errors.branchId} /></div>
            <div><Label className="text-xs">Sales representative *</Label><div className="mt-1.5"><FilterSelect label="Sales representative" className="w-full" value={form.salesRepId || "none"} onChange={(v) => set("salesRepId", v === "none" ? "" : v)} options={[{ value: "none", label: form.branchId ? "Select rep" : "Select a branch first" }, ...reps.map((x) => ({ value: x.id, label: x.name }))]} /></div><FieldError message={errors.salesRepId} /></div>
          </div>
          <div><Label className="text-xs">Product *</Label><div className="mt-1.5"><FilterSelect label="Product" className="w-full" value={form.productId || "none"} onChange={(v) => { const pr = db.products.find((x) => x.id === v); setForm((f) => ({ ...f, productId: v === "none" ? "" : v, unitPrice: pr ? String(pr.unitPrice) : f.unitPrice })); }} options={[{ value: "none", label: "Select product" }, ...db.products.map((x) => ({ value: x.id, label: `${x.name} · ${formatNaira(x.unitPrice)}` }))]} /></div><FieldError message={errors.productId} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="sale-qty" className="text-xs">Quantity *</Label><Input id="sale-qty" type="number" min={1} step={1} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} className="mt-1.5 h-9" /><FieldError message={errors.quantity} /></div>
            <div><Label htmlFor="sale-price" className="text-xs">Unit price (₦) *</Label><Input id="sale-price" type="number" min={1} value={form.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} className="mt-1.5 h-9" /><FieldError message={errors.unitPrice} /></div>
            <div><Label htmlFor="sale-date" className="text-xs">Sale date *</Label><Input id="sale-date" type="date" max={db.tenant.referenceDate} value={form.saleDate} onChange={(e) => set("saleDate", e.target.value)} className="mt-1.5 h-9" /><FieldError message={errors.saleDate} /></div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted p-4"><span className="text-xs text-muted-foreground">Total revenue</span><strong className="text-lg" data-testid="sale-total">{formatNaira(total)}</strong></div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Record sale</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
