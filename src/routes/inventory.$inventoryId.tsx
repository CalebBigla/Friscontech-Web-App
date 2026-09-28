import { createFileRoute } from "@tanstack/react-router";
import { InventoryDetailPage } from "@/components/inventory/inventory-detail-page";

export const Route = createFileRoute("/inventory/$inventoryId")({
  head: () => ({
    meta: [
      { title: "Inventory item — SalesFlow Pro" },
      { name: "description", content: "Stock position, pricing and movement history for a branch inventory item." },
      { property: "og:title", content: "Inventory item — SalesFlow Pro" },
      { property: "og:description", content: "On-hand, reserved and available stock with a full movement trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryDetailRoute,
});

function InventoryDetailRoute() {
  const { inventoryId } = Route.useParams();
  return <InventoryDetailPage inventoryId={inventoryId} />;
}
