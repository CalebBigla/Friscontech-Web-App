import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BadgeCheck, Boxes, CircleDollarSign, Target, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, Panel, ProgressBar, BandBadge } from "@/components/shared";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getApprovals } from "@/lib/approvals";
import { getBranchInventoryHealth, getBranchPerformance, getRepTargetProgress, getSalesRevenue, getTargetForRange, getWeeklyRevenueSeries, percentChange } from "@/lib/calculations";
import { getLowStockItems, getOutOfStockItems } from "@/lib/inventory-calculations";
import { addDays, monthOf } from "@/lib/dates";
import { formatCompactNaira, formatPercent } from "@/lib/format";

/** Branch-scoped dashboard for Managers: KPIs, team performance and what needs attention. */
export function ManagerDashboard() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const today = db.tenant.referenceDate;
  const month = monthOf(today);
  const branchId = scope.user.branchId;
  const branch = db.branches.find((b) => b.id === branchId);

  const data = useMemo(() => {
    if (!branchId) return null;
    const perf = getBranchPerformance(db, branchId, month);
    const todayRev = getSalesRevenue(db, { branchId, range: { from: today, to: today } });
    const weekRange = { from: addDays(today, -6), to: today };
    const week = getSalesRevenue(db, { branchId, range: weekRange });
    const prevWeek = getSalesRevenue(db, { branchId, range: { from: addDays(today, -13), to: addDays(today, -7) } });
    const series = getWeeklyRevenueSeries(db, 24, { branchId });
    const weekly = series.slice(12).map((w, i) => ({ ...w, previous: series[i]!.revenue, target: getTargetForRange(db, { from: w.from, to: w.to }, { branchId }) }));
    const reps = db.users.filter((u) => u.role === "sales_rep" && u.branchId === branchId && u.status === "active")
      .map((u) => ({ user: u, p: getRepTargetProgress(db, u.id, month) })).sort((a, b) => b.p.achievement - a.p.achievement);
    return { perf, todayRev, week, weekChange: percentChange(week, prevWeek), weekly, reps, inv: getBranchInventoryHealth(db, branchId), low: getLowStockItems(db, { branchId }).length, out: getOutOfStockItems(db, { branchId }).length };
  }, [db, branchId, month, today]);

  const approvals = getApprovals(db, scope).filter((a) => a.status === "pending" && a.requestedBy !== scope.user.id);
  const emergencies = approvals.filter((a) => a.emergency);

  if (!data || !branch) return <AppShell title="Dashboard"><EmptyState title="No branch assigned" detail="Ask the Owner to assign you to a branch." /></AppShell>;

  return (
    <AppShell title={`${branch.name} dashboard`} subtitle="Branch performance and items needing your attention">
      <div className="mb-5"><h1 className="text-xl font-bold">Good morning, {scope.user.name.split(" ")[0]}</h1><p className="mt-1 text-xs text-muted-foreground">{branch.name} · {branch.location}</p></div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} tone="success" label="Revenue this month" value={formatCompactNaira(data.perf.revenue)} detail={`${formatCompactNaira(data.todayRev)} today`} />
        <MetricCard icon={Target} tone="brand" label="Branch target" value={formatPercent(data.perf.achievement, 0)} detail={`${formatCompactNaira(data.perf.remaining)} remaining of ${formatCompactNaira(data.perf.target)}`} />
        <MetricCard icon={Boxes} tone="violet" label="Stock health" value={formatPercent(data.inv.healthPct, 0)} detail={`${data.low} low · ${data.out} out of stock`} />
        <MetricCard icon={BadgeCheck} tone="warning" label="Awaiting your approval" value={String(approvals.length)} detail={emergencies.length ? `${emergencies.length} emergency to review` : "Storekeeper requests"} badge={approvals.length ? "Action" : undefined} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.8fr]">
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="panel-title">Revenue trend</h2><p className="mt-1 font-light-copy text-xs text-muted-foreground">Last 12 weeks vs the 12 before, with prorated targets</p></div>
            <div className="text-right"><p className="text-lg font-bold">{formatCompactNaira(data.week)}</p><span className={`status ${data.weekChange >= 0 ? "status-success" : "status-danger"}`}>{data.weekChange >= 0 ? "+" : ""}{data.weekChange.toFixed(1)}% vs last week</span></div>
          </div>
          <RevenueTrendChart data={data.weekly} />
        </article>
        <Panel title="Needs attention" subtitle="Approvals and stock alerts">
          <div className="space-y-2 p-4">
            {approvals.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-md bg-muted p-3 text-xs">
                {a.emergency ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : <BadgeCheck className="size-4 shrink-0 text-primary" />}
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{a.type === "stock_addition" ? `Stock addition · +${a.quantity}` : "Product deactivation"}</p><p className="truncate text-[11px] text-muted-foreground">{db.products.find((p) => p.id === a.productId)?.name} · {a.id}</p></div>
                {a.emergency && <span className="status status-danger">Emergency</span>}
              </div>
            ))}
            {!approvals.length && <p className="p-3 text-xs text-muted-foreground">No approvals waiting.</p>}
            {(data.low > 0 || data.out > 0) && <Link to="/inventory" className="flex items-center justify-between rounded-md border border-border p-3 text-xs hover:bg-muted"><span>{data.low} low and {data.out} out-of-stock items</span><span className="font-semibold text-primary">View</span></Link>}
            <Button variant="outline" size="sm" className="w-full" asChild><Link to="/approvals">Open approvals</Link></Button>
          </div>
        </Panel>
      </section>

      <Panel className="mt-4" title="Team performance" subtitle={`Sales reps against ${month} targets`} action={<Button variant="ghost" size="sm" asChild><Link to="/team"><Users className="size-4" />Team</Link></Button>}>
        {data.reps.length === 0 ? <EmptyState title="No active sales reps" /> : (
          <div className="divide-y divide-border">{data.reps.map(({ user, p }) => (
            <div key={user.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-xs sm:grid-cols-[180px_1fr_110px_90px]">
              <Link to="/team/$userId" params={{ userId: user.id }} className="font-semibold hover:text-primary">{user.name}</Link>
              <div className="hidden sm:block"><ProgressBar value={p.achievement} band={p.band} /></div>
              <span className="text-right font-semibold">{formatCompactNaira(p.revenue)} <span className="font-normal text-muted-foreground">/ {formatCompactNaira(p.target)}</span></span>
              <span className="hidden justify-self-end sm:block"><BandBadge band={p.band} /></span>
            </div>
          ))}</div>
        )}
      </Panel>
    </AppShell>
  );
}
