/**
 * Demo session + RBAC scope. The signed-in user can be switched from the sidebar
 * so each role's view can be reviewed; real auth replaces this later.
 */
import { useSyncExternalStore } from "react";
import type { Db, User } from "@/data/mock-db";

let currentUserId = "user-001";
const listeners = new Set<() => void>();
export function setCurrentUserId(id: string) { currentUserId = id; listeners.forEach((l) => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useCurrentUserId = () => useSyncExternalStore(subscribe, () => currentUserId, () => currentUserId);

export type AccessScope = {
  user: User;
  /** null = every branch in the tenant */
  branchIds: string[] | null;
  /** set when the user may only see their own sales */
  repId?: string;
  canManageBranches: boolean;
  canRecordSales: boolean;
  canViewSales: boolean;
};

export function getAccessScope(db: Db, userId: string): AccessScope {
  const user = db.users.find((x) => x.id === userId) ?? db.users[0];
  const own = user.branchId ? [user.branchId] : [];
  switch (user.role) {
    case "owner": return { user, branchIds: null, canManageBranches: true, canRecordSales: true, canViewSales: true };
    case "manager": return { user, branchIds: own, canManageBranches: false, canRecordSales: true, canViewSales: true };
    case "storekeeper": return { user, branchIds: own, canManageBranches: false, canRecordSales: false, canViewSales: false };
    case "sales_rep": return { user, branchIds: own, repId: user.id, canManageBranches: false, canRecordSales: true, canViewSales: true };
  }
}
export const canSeeBranch = (scope: AccessScope, branchId: string) => !scope.branchIds || scope.branchIds.includes(branchId);
