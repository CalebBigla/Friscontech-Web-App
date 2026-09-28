import { createFileRoute } from "@tanstack/react-router";
import { OwnerDashboard } from "@/components/owner-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — SalesFlow Pro" },
      { name: "description", content: "Monitor sales, inventory, branches, targets, and team performance across your business." },
      { property: "og:title", content: "Owner Dashboard — SalesFlow Pro" },
      { property: "og:description", content: "A unified view of business performance, stock health, and team targets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <OwnerDashboard />;
}
