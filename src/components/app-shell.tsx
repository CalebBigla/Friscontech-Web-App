import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity, ArrowLeftRight, BarChart3, Bell, Boxes, ClipboardCheck, ClipboardList, LayoutDashboard, Menu, Package,
  Settings, ShoppingCart, Store, Target, Users, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDb } from "@/services/mock-store";
import { sessionService } from "@/services/services";
import { getAccessScope, setCurrentUserId, useCurrentUserId, type AccessScope } from "@/lib/session";
import { initials, roleLabel } from "@/lib/format";

type NavTo = "/" | "/branches" | "/sales" | "/inventory" | "/stock-requests" | "/products" | "/targets" | "/stock-movements" | "/audit-log" | "/team" | "/reports" | "/settings";
type NavItem = { label: string; icon: LucideIcon; to?: NavTo; ownerOnly?: boolean; needsSales?: boolean };
type NavSection = { title: string; items: NavItem[] };
const managementSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  { title: "Operations", items: [
    { label: "Branches", icon: Store, to: "/branches", ownerOnly: true },
    { label: "Sales", icon: ShoppingCart, to: "/sales", needsSales: true },
    { label: "Inventory", icon: Boxes, to: "/inventory" },
    { label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" },
    { label: "Products", icon: Package, to: "/products" },
    { label: "Targets", icon: Target, to: "/targets" },
    { label: "Reports", icon: BarChart3, to: "/reports" },
  ] },
  { title: "Administration", items: [{ label: "Team", icon: Users, to: "/team" }, { label: "Audit Log", icon: ClipboardCheck, to: "/audit-log" }, { label: "Settings", icon: Settings, to: "/settings" }] },
];
const repSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  { title: "Sales", items: [{ label: "My Sales", icon: ShoppingCart, to: "/sales" }, { label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" }] },
  { title: "Inventory", items: [{ label: "Inventory", icon: Boxes, to: "/inventory" }, { label: "Products", icon: Package, to: "/products" }] },
  { title: "Account", items: [{ label: "My Activity", icon: ClipboardCheck, to: "/audit-log" }, { label: "Settings", icon: Settings, to: "/settings" }] },
];
const storekeeperSections: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/" }] },
  { title: "Inventory", items: [{ label: "Inventory", icon: Boxes, to: "/inventory" }, { label: "Products", icon: Package, to: "/products" }, { label: "Stock Movements", icon: ArrowLeftRight, to: "/stock-movements" }] },
  { title: "Operations", items: [{ label: "Stock Requests", icon: ClipboardList, to: "/stock-requests" }] },
  { title: "Account", items: [{ label: "Audit Log", icon: ClipboardCheck, to: "/audit-log" }, { label: "Settings", icon: Settings, to: "/settings" }] },
];
const sectionsFor = (role: string) => role === "sales_rep" ? repSections : role === "storekeeper" ? storekeeperSections : managementSections;

const demoUserIds = ["user-001", "user-002", "user-022", "user-010"];

export function AppShell({ title, subtitle, headerExtra, actions, children }: { title: string; subtitle?: string | undefined; headerExtra?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const branch = db.branches.find((b) => b.id === scope.user.branchId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {open && <div className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"><Activity className="size-4" /></span>
            <div><p className="text-sm font-bold">SalesFlow Pro</p><p className="text-[10px] uppercase text-muted-foreground">{roleLabel[scope.user.role]} console</p></div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {sectionsFor(scope.user.role).map((section) => {
            const items = section.items.filter((i) => (!i.ownerOnly || scope.user.role === "owner") && (!i.needsSales || scope.canViewSales));
            if (!items.length) return null;
            return (
              <div key={section.title}>
                <p className="px-3 pb-2 pt-4 text-[10px] font-bold uppercase text-muted-foreground first:pt-2">{section.title}</p>
                <div className="space-y-1">
                  {items.map(({ label, icon: Icon, to }) => to ? (
                    <Link key={label} to={to} onClick={() => setOpen(false)} activeOptions={{ exact: to === "/" }}
                      className="flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      activeProps={{ className: "!bg-primary !text-primary-foreground" }}>
                      <Icon className="size-4" />{label}
                    </Link>
                  ) : (
                    <Button key={label} variant="ghost" className="w-full justify-start" onClick={() => toast(`${label} is coming in the next phase`)}>
                      <Icon className="size-4" />{label}<span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground">Soon</span>
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-md bg-muted p-3 text-left" aria-label="Switch demo user">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-avatar text-xs font-bold text-primary">{initials(scope.user.name)}</span>
                <div className="min-w-0"><p className="truncate text-xs font-bold">{scope.user.name}</p><p className="truncate text-[11px] text-muted-foreground">{roleLabel[scope.user.role]} · {branch?.name ?? db.tenant.name}</p></div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">View as (demo)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {demoUserIds.map((id) => { const x = db.users.find((usr) => usr.id === id)!; return (
                <DropdownMenuItem key={id} onClick={() => { sessionService.switchUser(userId, id); setCurrentUserId(id); }} className="flex-col items-start gap-0">
                  <span className="text-xs font-bold">{x.name}</span><span className="text-[11px] text-muted-foreground">{roleLabel[x.role]}</span>
                </DropdownMenuItem>
              ); })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></Button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold sm:text-base">{title}</p>{subtitle && <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>}</div>
          {headerExtra}
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" /></Button>
          {actions}
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}

/** Renders children only when the current role may use the module; the page itself never mounts otherwise. */
export function RoleGate({ allow, title, message, children }: { allow: (scope: AccessScope) => boolean; title: string; message: string; children: ReactNode }) {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  if (!allow(scope)) return <AppShell title={title}><RestrictedNotice message={message} /></AppShell>;
  return <>{children}</>;
}

export function RestrictedNotice({ message }: { message: string }) {
  return <div className="rounded-lg border border-border bg-card p-10 text-center shadow-panel"><p className="text-sm font-bold">Access restricted</p><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>;
}
