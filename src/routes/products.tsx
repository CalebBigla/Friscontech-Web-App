import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { AppShell, RoleGate } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, SearchBox, StockStatusBadge } from "@/components/shared";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryRows } from "@/lib/inventory-calculations";
import { formatNaira, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products — SalesFlow Pro" },
      { name: "description", content: "Product catalogue with pricing, thresholds and branch availability." },
      { property: "og:title", content: "Products — SalesFlow Pro" },
      { property: "og:description", content: "Add products and see their stock at your branch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.canManageProducts} title="Products" message="Product management is not part of your role."><ProductsPage /></RoleGate>,
});

function ProductsPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rows = getInventoryRows(db, { branchIds: scope.branchIds });
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return db.products.filter((p) => !needle || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle))
      .map((p) => ({ p, row: rows.find((r) => r.product.id === p.id) }));
  }, [db, query, rows]);

  return (
    <AppShell title="Products" subtitle="Catalogue and branch availability" actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /><span className="hidden sm:inline">Add Product</span></Button>}>
      <div className="mb-5"><h1 className="text-xl font-bold">Products</h1><p className="mt-1 text-xs text-muted-foreground">{db.products.length} products in the catalogue.</p></div>
      <Panel className="overflow-hidden" title="Catalogue" subtitle={`${list.length} of ${db.products.length} products`} action={<SearchBox value={query} onChange={setQuery} placeholder="Search name, SKU or category" />}>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Unit</th><th className="px-5 py-3 text-right">Selling price</th><th className="px-5 py-3 text-right">Unit cost</th><th className="px-5 py-3 text-right">Threshold</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody>{list.map(({ p, row }) => (
            <tr key={p.id} className="border-t border-border text-xs">
              <td className="px-5 py-3 font-bold">{p.name}</td><td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{p.sku}</td><td className="px-5 py-3">{p.category}</td><td className="px-5 py-3">{p.unit}</td>
              <td className="px-5 py-3 text-right font-semibold">{formatNaira(p.unitPrice)}</td><td className="px-5 py-3 text-right text-muted-foreground">{formatNaira(p.unitCost)}</td>
              <td className="px-5 py-3 text-right">{row?.record.lowStockThreshold ?? "—"}</td><td className="px-5 py-3 text-right font-bold">{row ? formatNumber(row.available) : "—"}</td>
              <td className="px-5 py-3">{row ? <StockStatusBadge status={row.status} /> : <span className="text-muted-foreground">Not stocked</span>}</td>
            </tr>))}</tbody>
        </table></div>
        {!list.length && <EmptyState title="No products match your search." />}
      </Panel>
      <AddProductDialog open={open} onOpenChange={setOpen} actorId={userId} />
    </AppShell>
  );
}
