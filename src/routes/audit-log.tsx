import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, ClipboardCheck, ClipboardList, Package, ShoppingCart, type LucideIcon } from "lucide-react";

import { AppShell, RoleGate } from "@/components/app-shell";
import { ALL, EmptyState, FilterSelect, Panel } from "@/components/shared";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getAuditLog, type AuditKind } from "@/lib/audit";
import { formatDayTime } from "@/lib/format";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — SalesFlow Pro" },
      { name: "description", content: "Your personal history of sales, requests and stock actions." },
      { property: "og:title", content: "Audit Log — SalesFlow Pro" },
      { property: "og:description", content: "A record of the actions you performed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate allow={(s) => s.user.role === "sales_rep" || s.user.role === "storekeeper"} title="Audit Log" message="The audit log is coming in the next phase for your role."><AuditPage /></RoleGate>,
});

const kinds: Record<AuditKind, { label: string; Icon: LucideIcon }> = {
  sale: { label: "Sales", Icon: ShoppingCart }, request: { label: "Stock requests", Icon: ClipboardList }, review: { label: "Request reviews", Icon: ClipboardCheck },
  stock: { label: "Stock changes", Icon: ArrowLeftRight }, product: { label: "Products", Icon: Package },
};

function AuditPage() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const [kind, setKind] = useState(ALL);
  const [limit, setLimit] = useState(40);
  const all = getAuditLog(db, scope);
  const list = all.filter((e) => kind === ALL || e.kind === kind);
  const present = [...new Set(all.map((e) => e.kind))];
  return (
    <AppShell title="Audit Log" subtitle="Only actions you performed">
      <div className="mb-5"><h1 className="text-xl font-bold">My Activity</h1><p className="mt-1 text-xs text-muted-foreground">A record of every action you performed in SalesFlow Pro.</p></div>
      <Panel title="Activity" subtitle={`${list.length} entries`} action={<FilterSelect label="Activity type" value={kind} onChange={(v) => { setKind(v); setLimit(40); }} options={[{ value: ALL, label: "All activity" }, ...present.map((k) => ({ value: k, label: kinds[k].label }))]} />}>
        <ul className="divide-y divide-border">{list.slice(0, limit).map((e) => { const { Icon } = kinds[e.kind]; const body = <><p className="text-xs font-bold">{e.action}</p><p className="truncate text-[11px] text-muted-foreground">{e.subject}</p></>; return (
          <li key={e.id} className="flex items-center gap-3 px-5 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary"><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1">{e.link?.requestId ? <Link to="/stock-requests/$requestId" params={{ requestId: e.link.requestId }} className="hover:text-primary">{body}</Link> : e.link?.inventoryId ? <Link to="/inventory/$inventoryId" params={{ inventoryId: e.link.inventoryId }} className="hover:text-primary">{body}</Link> : body}</div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatDayTime(e.at, db.tenant.referenceDate)}</span>
          </li>); })}</ul>
        {!list.length && <EmptyState title="No activity yet." />}
        {list.length > limit && <div className="border-t border-border p-3 text-center"><button className="text-xs font-semibold text-primary" onClick={() => setLimit((l) => l + 40)}>Show more</button></div>}
      </Panel>
    </AppShell>
  );
}
