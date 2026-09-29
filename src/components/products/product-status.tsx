import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Product, ProductStatus } from "@/data/mock-db";
import { productService } from "@/services/services";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`status whitespace-nowrap ${status === "active" ? "status-success" : "status-warning"}`}>{status === "active" ? "Active" : "Inactive"}</span>;
}

/** Confirms activate/deactivate. Deactivation is soft: history is preserved. */
export function ProductStatusDialog({ product, onClose, actorId }: { product: Product | null; onClose: () => void; actorId: string }) {
  const [busy, setBusy] = useState(false);
  const deactivating = product?.status === "active";
  return (
    <AlertDialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deactivating ? "Deactivate" : "Activate"} {product?.name}?</AlertDialogTitle>
          <AlertDialogDescription>{deactivating
            ? "It will no longer be available for new sales, stock requests or stock additions. Historical sales, requests and movements stay intact."
            : "It becomes available again for new sales, stock requests and stock additions."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} className={deactivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={async (e) => {
            e.preventDefault();
            if (!product) return;
            setBusy(true);
            const r = await productService.setStatus(product.id, deactivating ? "inactive" : "active", actorId);
            setBusy(false);
            if (r.ok) toast.success(`${product.name} ${deactivating ? "deactivated" : "activated"}`); else toast.error(r.errors.form ?? "Could not update product");
            onClose();
          }}>{busy ? "Saving…" : deactivating ? "Deactivate product" : "Activate product"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
