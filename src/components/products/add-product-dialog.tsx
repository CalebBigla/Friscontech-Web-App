import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/shared";
import { productService, type FieldErrors } from "@/services/services";

const empty = { name: "", sku: "", category: "", unit: "pcs", unitPrice: "", unitCost: "", threshold: "10" };
type Key = keyof typeof empty;

export function AddProductDialog({ open, onOpenChange, actorId }: { open: boolean; onOpenChange: (o: boolean) => void; actorId: string }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm(empty); setErrors({}); } }, [open]);
  const set = (k: Key, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await productService.create({ name: form.name, sku: form.sku, category: form.category, unit: form.unit, unitPrice: Number(form.unitPrice), unitCost: Number(form.unitCost || 0), lowStockThreshold: Number(form.threshold) }, actorId);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    toast.success(`${r.data.name} added`, { description: "Available in inventory with 0 units — add stock to start selling." });
    onOpenChange(false);
  }

  const field = (k: Key, label: string, err: keyof FieldErrors, props: Record<string, unknown> = {}) => (
    <div><Label htmlFor={`p-${k}`} className="text-xs">{label}</Label><Input id={`p-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} className="mt-1.5 h-9" {...props} /><FieldError message={errors[err]} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add product</DialogTitle><DialogDescription className="text-xs">The product joins the shared catalogue and your branch inventory.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {field("name", "Product name *", "name")}
          <div className="grid gap-3 sm:grid-cols-3">{field("sku", "SKU *", "sku")}{field("category", "Category *", "category")}{field("unit", "Unit *", "unit")}</div>
          <div className="grid gap-3 sm:grid-cols-3">{field("unitPrice", "Selling price (₦) *", "unitPrice", { type: "number", min: 1 })}{field("unitCost", "Unit cost (₦)", "unitCost", { type: "number", min: 0 })}{field("threshold", "Low-stock threshold *", "threshold", { type: "number", min: 0, step: 1 })}</div>
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Add product</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
