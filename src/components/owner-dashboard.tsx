import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronDown, CircleDollarSign, FileText, Package, Search, ShieldCheck, Target, Users } from "lucide-react";
import { toast } from "sonner";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";
import { useDb } from "@/services/mock-store";
import { requestStatusLabel } from "@/lib/inventory-calculations";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import {
  bandLabel, getBranchInventoryHealth, getBranchManager, getBranchPerformance, getDeadStockValue, getSalesRevenue,
  getTargetForRange, getWeeklyRevenueSeries, percentChange,
} from "@/lib/calculations";
import { getPeriodRange, isoWeek, monthOf, previousRange, type PeriodKey } from "@/lib/dates";
import { formatCompactNaira, formatPercent, formatTime } from "@/lib/format";

type Period = "Day" | "Week" | "Month" | "Quarter";
const periodKey: Record<Period, PeriodKey> = { Day: "today", Week: "week", Month: "month", Quarter: "quarter" };
const metricIcons = [CircleDollarSign, Building2, Users, Target] as const;

function minutesAgo(iso: string, now: string) {
  const diff = Math.max(0, Math.round((Date.parse(`${now}:00`) - Date.parse(iso)) / 60000));
  return diff < 60 ? `${diff}m` : `${Math.round(diff / 60)}h`;
}

export function OwnerDashboard() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [period, setPeriod] = useState<Period>("Week");
  const [query, setQuery] = useState("");

  const today = db.tenant.referenceDate;
  const nowIso = `${today}T${db.tenant.lastSyncTime}`;
  const month = monthOf(today);

  const data = useMemo(() => {
    const active = db.branches.filter((b) => b.status === "active");
    const activeIds = active.map((b) => b.id);
    const range = getPeriodRange(periodKey[period], today);
    const revenue = getSalesRevenue(db, { range });
    const prevRevenue = getSalesRevenue(db, { range: previousRange(range) });
    const target = getTargetForRange(db, range, {});
    const attainment = target ? (revenue / target) * 100 : 0;
    const team = db.users.filter((x) => x.status === "active" && x.role !== "owner" && x.branchId && activeIds.includes(x.branchId));
    const prevTarget = getTargetForRange(db, previousRange(range), {});
    const prevAttainment = prevTarget ? (prevRevenue / prevTarget) * 100 : 0;
    const change = percentChange(revenue, prevRevenue);
    const metrics = [
      { label: "Total revenue", value: formatCompactNaira(revenue), detail: `${formatCompactNaira(prevRevenue)} previous period`, change: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`, tone: change >= 0 ? "success" : "danger" },
      { label: "Active branches", value: String(active.length), detail: `${db.branches.length - active.length} inactive of ${db.branches.length}`, change: formatPercent((active.length / db.branches.length) * 100, 0), tone: "brand" },
      { label: "Team members", value: String(team.length), detail: `Across ${active.length} branches`, change: `${db.users.filter((x) => x.role === "sales_rep" && team.includes(x)).length} reps`, tone: "violet" },
      { label: "Target attainment", value: formatPercent(attainment, 0), detail: `${formatCompactNaira(Math.max(target - revenue, 0))} remaining`, change: `${attainment - prevAttainment >= 0 ? "+" : ""}${(attainment - prevAttainment).toFixed(0)}%`, tone: "warning" },
    ];
    const weekly = getWeeklyRevenueSeries(db, 12).map((week) => ({
      ...week,
      target: getTargetForRange(db, { from: week.from, to: week.to }, {}),
    }));
    const w1 = weekly[weekly.length - 1]?.revenue ?? 0, w0 = weekly[weekly.length - 2]?.revenue ?? 0;
    const inv = getBranchInventoryHealth(db, undefined, activeIds);
    const branchRows = active.map((b) => ({ branch: b, manager: getBranchManager(db, b), perf: getBranchPerformance(db, b.id, month) }))
      .sort((a, b) => b.perf.revenue - a.perf.revenue);
    return { metrics, weekly, weeklyChange: percentChange(w1, w0), inv, dead: getDeadStockValue(db, activeIds), branchRows };
  }, [db, period, today, month]);

  const visibleBranches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? data.branchRows.filter((r) => `${r.branch.name} ${r.manager?.name ?? ""}`.toLowerCase().includes(needle)) : data.branchRows;
  }, [data.branchRows, query]);

  const requests = db.stockRequests.filter((r) => r.requestedAt.startsWith(today));
  const pending = requests.filter((r) => r.status === "pending").length;
  const openEscalations = db.escalations.filter((e) => e.status === "open");
  const inventory = [
    { label: "Healthy stock", value: data.inv.healthPct, count: `${data.inv.healthy} SKUs` },
    { label: "Low stock", value: data.inv.lowPct, count: `${data.inv.low} items` },
    { label: "Out of stock", value: data.inv.outPct, count: `${data.inv.out} items` },
  ];
  const nameOf = (id: string) => db.branches.find((b) => b.id === id)?.name ?? "—";
  const productOf = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";

  const searchBox = (
    <label className="hidden h-9 w-64 items-center gap-2 rounded-md border border-border bg-muted px-3 md:flex">
      <Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" placeholder="Search branches or managers" />
    </label>
  );

  if (scope.user.role !== "owner") {
    return <AppShell title="Business health overview"><RestrictedNotice message="The business-wide dashboard is available to Owners. Use Branches or Sales for your assigned location." /></AppShell>;
  }

  return (
    <AppShell title="Business health overview" subtitle={`Live operations across ${db.tenant.name}`} headerExtra={searchBox}
      actions={<Button onClick={() => toast.success("Report export queued", { description: "You'll be notified when the file is ready." })}><FileText className="size-4" /><span className="hidden sm:inline">Export report</span></Button>}>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h1 className="text-xl font-bold">Good afternoon, {scope.user.name.split(" ")[0]}</h1><p className="mt-1 text-xs text-muted-foreground">Updated today at {db.tenant.lastSyncTime} AM · Fiscal week W{isoWeek(today)}</p></div>
        <div className="grid grid-cols-4 rounded-md border border-border bg-card p-1">{(["Day", "Week", "Month", "Quarter"] as Period[]).map((item) => <Button key={item} size="sm" variant={period === item ? "default" : "ghost"} onClick={() => setPeriod(item)}>{item}</Button>)}</div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? CircleDollarSign;
          return <article key={metric.label} className="rounded-lg border border-border bg-card p-5 shadow-panel">
            <div className="flex items-start justify-between"><span className={`metric-icon metric-icon-${metric.tone === "danger" ? "warning" : metric.tone}`}><Icon className="size-5" /></span><span className={`status status-${metric.tone}`}>{metric.change}</span></div>
            <p className="mt-5 text-xs text-muted-foreground">{metric.label} · {period}</p><p className="mt-1 text-2xl font-bold">{metric.value}</p><p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
          </article>;
        })}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.8fr]">
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4"><div><h2 className="panel-title">Revenue trend</h2><p className="mt-1 font-light-copy text-xs text-muted-foreground">12-week gross sales against prorated targets</p></div><span className={`status ${data.weeklyChange >= 0 ? "status-success" : "status-danger"}`}>{data.weeklyChange >= 0 ? "+" : ""}{data.weeklyChange.toFixed(1)}%</span></div>
          <RevenueTrendChart data={data.weekly} />
        </article>
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between"><h2 className="panel-title">Inventory health</h2><span className={`status ${data.inv.status === "Healthy" ? "status-success" : "status-warning"}`}>{data.inv.status}</span></div>
          <div className="mt-6 space-y-5">{inventory.map((item, index) => <div key={item.label}><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">{item.label}</span><span className="font-bold">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full inventory-bar-${index}`} style={{ width: `${item.value}%` }} /></div></div>)}</div>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Dead stock value</span><strong className="text-destructive">{formatCompactNaira(data.dead)}</strong></div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between"><h2 className="panel-title">Stock requests</h2><span className="status status-brand">{pending} pending</span></div>
          <div className="mt-4 space-y-2">{requests.map((request) => { const done = request.status !== "pending"; return <div key={request.id} className="flex items-center gap-3 rounded-md bg-muted p-3"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-background"><Package className="size-4 text-primary" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{nameOf(request.branchId)}</p><p className="truncate text-[10px] text-muted-foreground">{request.quantityRequested} units · {productOf(request.productId)} · {minutesAgo(request.requestedAt, nowIso)}</p></div><Button size="sm" variant={done ? "soft" : "ghost"} asChild><Link to="/stock-requests/$requestId" params={{ requestId: request.id }}>{done ? <><Check className="size-3" />{requestStatusLabel[request.status]}</> : "Review"}</Link></Button></div>; })}</div>
        </article>
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between"><h2 className="panel-title">Recent activity</h2><Button variant="ghost" size="sm" asChild><Link to="/sales">View all</Link></Button></div>
          <div className="mt-3">{db.activities.slice(0, 4).map((item) => <div key={item.id} className="flex gap-3 border-b border-border py-3 last:border-0"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="size-3" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.action}</p><p className="truncate text-[10px] text-muted-foreground">{item.subject}</p></div><span className="text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</span></div>)}</div>
        </article>
        <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
          <div className="flex items-center justify-between"><h2 className="panel-title">Escalations</h2><span className="status status-danger">{openEscalations.length} open</span></div>
          <div className="mt-4 space-y-2">{openEscalations.map((alert) => <div key={alert.id} className={`alert alert-${alert.tone}`}><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase">{alert.type}</span><span className="text-[9px]">{minutesAgo(alert.createdAt, nowIso)} ago</span></div><p className="mt-1 text-xs font-bold">{nameOf(alert.branchId)}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{alert.detail}</p></div>)}</div>
        </article>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-panel">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="panel-title">Branch performance</h2><p className="mt-1 text-xs text-muted-foreground">Month-to-date revenue and target progress by location</p></div><Button variant="outline" size="sm" asChild><Link to="/branches">All branches<ChevronDown className="size-3 -rotate-90" /></Link></Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Branch</th><th className="px-5 py-3">Manager</th><th className="px-5 py-3">Revenue</th><th className="px-5 py-3">Target progress</th><th className="px-5 py-3 text-right">Status</th></tr></thead><tbody>{visibleBranches.map(({ branch, manager, perf }) => <tr key={branch.id} className="border-t border-border text-xs"><td className="px-5 py-4 font-bold"><Link to="/branches/$branchId" params={{ branchId: branch.id }} className="hover:text-primary">{branch.name}</Link></td><td className="px-5 py-4 text-muted-foreground">{manager?.name ?? "Unassigned"}</td><td className="px-5 py-4 font-bold">{formatCompactNaira(perf.revenue)}<span className="ml-2 text-[10px] font-normal text-muted-foreground">/ {formatCompactNaira(perf.target)}</span></td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${perf.band === "exceeding" ? "bg-success" : perf.band === "on_track" ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.min(perf.achievement, 100)}%` }} /></div><strong>{perf.achievement.toFixed(0)}%</strong></div></td><td className="px-5 py-4 text-right"><span className={`status ${perf.band === "exceeding" ? "status-success" : perf.band === "on_track" ? "status-brand" : "status-danger"}`}>{bandLabel[perf.band]}</span></td></tr>)}</tbody></table></div>
        {visibleBranches.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No branches match “{query}”.</div>}
      </section>
      <div className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" />Viewing tenant-scoped data for {db.tenant.name}</div>
    </AppShell>
  );
}
