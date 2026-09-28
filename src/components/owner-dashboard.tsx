import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Target,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  activities,
  alerts,
  branchPerformance,
  inventory,
  metrics,
  stockRequests,
  tenant,
  weeklyRevenue,
  type Period,
} from "@/data/owner-dashboard";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Branches", icon: Store },
  { label: "Sales", icon: ShoppingCart },
  { label: "Targets", icon: Target },
  { label: "Inventory", icon: Boxes },
  { label: "Products", icon: Package },
  { label: "Users", icon: Users },
  { label: "Reports", icon: BarChart3 },
];

const settingsNavigation = [
  { label: "Audit log", icon: ClipboardCheck },
  { label: "Settings", icon: Settings },
];

export function OwnerDashboard() {
  const [period, setPeriod] = useState<Period>("Week");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [approved, setApproved] = useState<string[]>([]);

  const visibleBranches = useMemo(() => {
    if (!query.trim()) return branchPerformance;
    const needle = query.toLowerCase();
    return branchPerformance.filter((item) => `${item.branch} ${item.manager}`.toLowerCase().includes(needle));
  }, [query]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><Activity className="size-4" /></span>
            <div><p className="text-sm font-bold">SalesFlow Pro</p><p className="text-[10px] text-muted-foreground">OWNER CONSOLE</p></div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X className="size-4" /></Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase text-muted-foreground">Overview</p>
          <Button variant="default" className="w-full justify-start"><LayoutDashboard className="size-4" />Dashboard</Button>
          <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase text-muted-foreground">Operations</p>
          <div className="space-y-1">{navigation.slice(1).map(({ label, icon: Icon }) => <Button key={label} variant="ghost" className="w-full justify-start"><Icon className="size-4" />{label}</Button>)}</div>
          <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase text-muted-foreground">Workspace</p>
          <div className="space-y-1">{settingsNavigation.map(({ label, icon: Icon }) => <Button key={label} variant="ghost" className="w-full justify-start"><Icon className="size-4" />{label}</Button>)}</div>
        </nav>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-md bg-muted p-3">
            <span className="grid size-9 place-items-center rounded-full bg-avatar font-bold text-primary">MD</span>
            <div className="min-w-0"><p className="truncate text-xs font-bold">{tenant.owner.name}</p><p className="truncate text-[11px] text-muted-foreground">{tenant.owner.role} · {tenant.name}</p></div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu className="size-5" /></Button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold sm:text-base">Business health overview</p><p className="hidden text-xs text-muted-foreground sm:block">Live operations across {tenant.name}</p></div>
          <label className="hidden h-9 w-64 items-center gap-2 rounded-md border border-border bg-muted px-3 md:flex">
            <Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" placeholder="Search branches or managers" />
          </label>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" /></Button>
          <Button><FileText className="size-4" /><span className="hidden sm:inline">Export report</span></Button>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-7">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div><h1 className="text-xl font-bold">Good afternoon, Marcus</h1><p className="mt-1 text-xs text-muted-foreground">Updated today at 09:14 AM · Fiscal week {tenant.fiscalWeek}</p></div>
            <div className="grid grid-cols-4 rounded-md border border-border bg-card p-1">{(["Day", "Week", "Month", "Quarter"] as Period[]).map((item) => <Button key={item} size="sm" variant={period === item ? "default" : "ghost"} onClick={() => setPeriod(item)}>{item}</Button>)}</div>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric, index) => {
              const icons = [CircleDollarSign, Building2, Users, Target]; const Icon = icons[index];
              return <article key={metric.label} className="rounded-lg border border-border bg-card p-5 shadow-panel">
                <div className="flex items-start justify-between"><span className={`metric-icon metric-icon-${metric.tone}`}><Icon className="size-5" /></span><span className={`status status-${metric.tone}`}>{metric.change}</span></div>
                <p className="mt-5 text-xs text-muted-foreground">{metric.label} · {period}</p><p className="mt-1 text-2xl font-bold">{metric.value}</p><p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
              </article>;
            })}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.8fr]">
            <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <div className="flex items-start justify-between"><div><h2 className="panel-title">Revenue trend</h2><p className="mt-1 text-xs text-muted-foreground">Gross sales across all branches</p></div><span className="status status-success">+12.4%</span></div>
              <div className="mt-6 flex h-44 items-end gap-2 border-b border-border pt-4 sm:gap-3">{weeklyRevenue.map((value, index) => <div key={index} className="group relative flex h-full flex-1 items-end"><div className="w-full rounded-t-sm bg-chart transition-colors group-hover:bg-primary" style={{ height: `${value / 1.25}%` }}><span className="sr-only">Week {index + 1}: {value}</span></div></div>)}</div>
              <div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>W31</span><span>W34</span><span>W37</span><span>W40</span><span>W42</span></div>
            </article>
            <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <div className="flex items-center justify-between"><h2 className="panel-title">Inventory health</h2><span className="status status-success">Healthy</span></div>
              <div className="mt-6 space-y-5">{inventory.map((item, index) => <div key={item.label}><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">{item.label}</span><span className="font-bold">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full inventory-bar-${index}`} style={{ width: `${item.value}%` }} /></div></div>)}</div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Dead stock value</span><strong className="text-destructive">₦4.21m</strong></div>
            </article>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
            <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <div className="flex items-center justify-between"><h2 className="panel-title">Stock requests</h2><span className="status status-brand">{stockRequests.length} pending</span></div>
              <div className="mt-4 space-y-2">{stockRequests.map((request) => { const done = approved.includes(request.id); return <div key={request.id} className="flex items-center gap-3 rounded-md bg-muted p-3"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-background"><Package className="size-4 text-primary" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{request.branch}</p><p className="truncate text-[10px] text-muted-foreground">{request.quantity} units · {request.item} · {request.age}</p></div><Button size="sm" variant={done ? "soft" : "ghost"} onClick={() => setApproved((current) => [...current, request.id])} disabled={done}>{done ? <><Check className="size-3" />Approved</> : "Approve"}</Button></div>; })}</div>
            </article>
            <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <div className="flex items-center justify-between"><h2 className="panel-title">Recent activity</h2><Button variant="ghost" size="sm">View all</Button></div>
              <div className="mt-3">{activities.map((item, index) => <div key={item.action} className="flex gap-3 border-b border-border py-3 last:border-0"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="size-3" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.action}</p><p className="truncate text-[10px] text-muted-foreground">{item.subject}</p></div><span className="text-[10px] text-muted-foreground">{item.time}</span></div>)}</div>
            </article>
            <article className="rounded-lg border border-border bg-card p-5 shadow-panel">
              <div className="flex items-center justify-between"><h2 className="panel-title">Escalations</h2><span className="status status-danger">3 open</span></div>
              <div className="mt-4 space-y-2">{alerts.map((alert) => <div key={alert.title} className={`alert alert-${alert.tone}`}><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase">{alert.type}</span><span className="text-[9px]">{alert.time}</span></div><p className="mt-1 text-xs font-bold">{alert.title}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{alert.detail}</p></div>)}</div>
            </article>
          </section>

          <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-panel">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="panel-title">Branch performance</h2><p className="mt-1 text-xs text-muted-foreground">Revenue and target progress by location</p></div><Button variant="outline" size="sm">All branches<ChevronDown className="size-3" /></Button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Branch</th><th className="px-5 py-3">Manager</th><th className="px-5 py-3">Revenue</th><th className="px-5 py-3">Target progress</th><th className="px-5 py-3 text-right">Status</th></tr></thead><tbody>{visibleBranches.map((row) => <tr key={row.branch} className="border-t border-border text-xs"><td className="px-5 py-4 font-bold">{row.branch}</td><td className="px-5 py-4 text-muted-foreground">{row.manager}</td><td className="px-5 py-4 font-bold">{row.revenue}<span className="ml-2 text-[10px] font-normal text-muted-foreground">/ {row.target}</span></td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${row.progress >= 95 ? "bg-success" : row.progress >= 80 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.min(row.progress, 100)}%` }} /></div><strong>{row.progress}%</strong></div></td><td className="px-5 py-4 text-right"><span className={`status ${row.progress >= 100 ? "status-success" : row.progress >= 90 ? "status-brand" : row.progress >= 80 ? "status-warning" : "status-danger"}`}>{row.status}</span></td></tr>)}</tbody></table></div>
            {visibleBranches.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No branches match “{query}”.</div>}
          </section>
          <div className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" />Viewing tenant-scoped data for {tenant.name}</div>
        </main>
      </div>
    </div>
  );
}