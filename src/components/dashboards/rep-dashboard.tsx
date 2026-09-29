import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleDollarSign, ClipboardList, Flag, Package, Plus, Receipt, ShoppingCart } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, Panel, ProgressBar, RequestStatusBadge } from "@/components/shared";
import { RecordSaleDialog } from "@/components/sales/record-sale-dialog";
import { NewRequestDialog } from "@/components/stock-requests/new-request-dialog";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { filterSales, getRepTargetProgress, getSalesRevenue, saleTotal } from "@/lib/calculations";
import { getInventoryRows, getPendingStockRequests, getStockRequests } from "@/lib/inventory-calculations";
import { monthOf } from "@/lib/dates";
import { formatCompactNaira, formatDayTime, formatMonth, formatNaira, formatNumber, formatPercent } from "@/lib/format";

/** Personal workspace: every figure is scoped to the signed-in sales rep. */
export function RepDashboard() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const [saleOpen, setSaleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const repId = scope.user.id;
  const branchId = scope.user.branchId ?? "";
  const today = db.tenant.referenceDate;
  const month = monthOf(today);

  const todayRevenue = getSalesRevenue(db, { repId, range: { from: today, to: today } });
  const todayCount = filterSales(db, { repId, range: { from: today, to: today } }).length;
  const progress = getRepTargetProgress(db, repId, month);
  const available = getInventoryRows(db, { branchId }).filter((r) => r.available > 0).length;
  const pending = getPendingStockRequests(db, { repId }).length;
  const recentSales = filterSales(db, { repId, includeNonCompleted: true }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const recentRequests = getStockRequests(db, { repId }).slice(0, 6);
  const product = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const branchName = db.branches.find((b) => b.id === branchId)?.name;

  return (
    <AppShell title="My workspace" subtitle={branchName ? `Current branch: ${branchName}` : undefined}
      actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setRequestOpen(true)}><ClipboardList className="size-4" /><span className="hidden sm:inline">Request Stock</span></Button><Button onClick={() => setSaleOpen(true)}><Plus className="size-4" /><span className="hidden sm:inline">Record Sale</span></Button></div>}>
      <div className="mb-5"><h1 className="text-xl font-bold">Good day, {scope.user.name.split(" ")[0]}</h1><p className="mt-1 text-xs text-muted-foreground">Your sales, stock and target for {formatMonth(month)}.</p></div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="panel-title flex items-center gap-2"><Flag className="size-4 text-primary" />Target progress</p>
            <p className="mt-3 text-3xl font-bold">{formatCompactNaira(progress.revenue)}<span className="text-lg font-medium text-muted-foreground"> / {formatCompactNaira(progress.target)}</span></p>
            <div className="mt-4"><ProgressBar value={progress.achievement} band={progress.band} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{formatPercent(progress.achievement)} of your monthly target achieved</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-96">
            <div className="rounded-md bg-muted p-4"><p className="text-[11px] text-muted-foreground">Target remaining</p><p className="mt-1 text-lg font-bold">{formatNaira(progress.remaining)}</p></div>
            <div className="rounded-md bg-muted p-4"><p className="text-[11px] text-muted-foreground">Achievement</p><p className="mt-1 text-lg font-bold">{formatPercent(progress.achievement)}</p></div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} tone="success" label="Today's sales" value={formatNaira(todayRevenue)} detail={`${todayCount} completed today`} />
        <MetricCard icon={Receipt} tone="brand" label="Monthly sales" value={formatCompactNaira(progress.revenue)} detail={`${formatMonth(month)} to date`} />
        <MetricCard icon={Package} tone="violet" label="Products available" value={formatNumber(available)} detail="In stock at your branch" />
        <MetricCard icon={ClipboardList} tone="warning" label="Pending requests" value={formatNumber(pending)} detail="Awaiting storekeeper" badge={pending ? "Open" : undefined} />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Recent sales" subtitle="Only your own sales" action={<Button variant="ghost" size="sm" asChild><Link to="/sales">View all</Link></Button>}>
          {recentSales.length ? <table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Revenue</th><th className="px-5 py-3 text-right">Date</th></tr></thead>
            <tbody>{recentSales.map((s) => <tr key={s.id} className="border-t border-border text-xs"><td className="px-5 py-3 font-semibold">{product(s.productId)}</td><td className="px-5 py-3 text-right">{s.quantity}</td><td className="px-5 py-3 text-right font-bold">{formatNaira(saleTotal(s))}</td><td className="px-5 py-3 text-right text-muted-foreground">{formatDayTime(s.createdAt, today)}</td></tr>)}</tbody></table>
            : <EmptyState title="No sales yet" detail="Record your first sale to see it here." />}
        </Panel>
        <Panel title="Recent stock requests" subtitle="Your latest requests" action={<Button variant="ghost" size="sm" asChild><Link to="/stock-requests">View all</Link></Button>}>
          {recentRequests.length ? <table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Date</th></tr></thead>
            <tbody>{recentRequests.map((r) => <tr key={r.id} className="border-t border-border text-xs"><td className="px-5 py-3 font-semibold"><Link to="/stock-requests/$requestId" params={{ requestId: r.id }} className="hover:text-primary">{product(r.productId)}</Link></td><td className="px-5 py-3 text-right">{r.quantityRequested}</td><td className="px-5 py-3"><RequestStatusBadge request={r} /></td><td className="px-5 py-3 text-right text-muted-foreground">{formatDayTime(r.requestedAt, today)}</td></tr>)}</tbody></table>
            : <EmptyState title="No requests yet" detail="Request stock when you run low." />}
        </Panel>
      </div>
      <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><ShoppingCart className="size-3" />Figures include completed sales only.</p>

      <RecordSaleDialog open={saleOpen} onOpenChange={setSaleOpen} scope={scope} />
      <NewRequestDialog open={requestOpen} onOpenChange={setRequestOpen} scope={scope} />
    </AppShell>
  );
}
