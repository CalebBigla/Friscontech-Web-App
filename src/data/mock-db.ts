/**
 * Centralized, relational mock datasets for SalesFlow Pro.
 * Records mirror future PostgreSQL tables: every relationship is expressed through IDs.
 * Derived values (revenue, staff counts, performance) are NEVER stored here —
 * they are computed in src/lib/calculations.ts.
 */

export type Role = "owner" | "manager" | "storekeeper" | "sales_rep";
export type BranchStatus = "active" | "inactive";
export type SaleStatus = "completed" | "pending" | "voided";

export type Tenant = { id: string; name: string; currency: "NGN"; referenceDate: string; lastSyncTime: string };
export type Branch = {
  id: string; tenantId: string; name: string; code: string; location: string; address: string;
  phone: string; email: string; managerId: string | null; status: BranchStatus; createdAt: string;
};
export type User = { id: string; tenantId: string; name: string; email: string; role: Role; branchId: string | null; status: "active" | "inactive" };
export type Product = { id: string; tenantId: string; name: string; sku: string; category: string; unitPrice: number };
export type Sale = {
  id: string; tenantId: string; code: string; branchId: string; salesRepId: string; productId: string;
  quantity: number; unitPrice: number; saleDate: string; createdAt: string; status: SaleStatus;
};
export type InventoryRecord = { id: string; tenantId: string; branchId: string; productId: string; quantity: number; reorderLevel: number };
export type Target = { id: string; tenantId: string; scope: "branch" | "rep"; branchId: string; userId: string | null; month: string; amount: number };
export type StockRequest = { id: string; tenantId: string; branchId: string; productId: string; quantity: number; requestedAt: string; priority: "Normal" | "High"; status: "pending" | "approved" };
export type Activity = { id: string; tenantId: string; action: string; subject: string; actorId: string; createdAt: string };
export type Escalation = { id: string; tenantId: string; branchId: string; type: string; detail: string; createdAt: string; tone: "danger" | "warning" | "neutral"; status: "open" | "resolved" };

export type Db = {
  tenant: Tenant; branches: Branch[]; users: User[]; products: Product[]; sales: Sale[];
  inventory: InventoryRecord[]; targets: Target[]; stockRequests: StockRequest[];
  activities: Activity[]; escalations: Escalation[];
};

const T = "tenant-001";
const REF = "2026-09-28";

const tenant: Tenant = { id: T, name: "Westfield Retail", currency: "NGN", referenceDate: REF, lastSyncTime: "09:14" };

const b = (id: string, name: string, code: string, location: string, address: string, managerId: string | null, status: BranchStatus = "active"): Branch => ({
  id, tenantId: T, name, code, location, address, managerId, status, createdAt: "2025-01-10",
  phone: `+234 80${id.slice(-1)} 555 01${id.slice(-2)}`, email: `${code.split("-")[0].toLowerCase()}@westfield.ng`,
});

const branches: Branch[] = [
  b("branch-001", "Ikeja Branch", "IKJ-001", "Ikeja, Lagos", "14 Obafemi Awolowo Way, Ikeja", "user-002"),
  b("branch-002", "Victoria Island Branch", "VI-002", "Victoria Island, Lagos", "7 Adeola Odeku Street, VI", "user-003"),
  b("branch-003", "Lekki Branch", "LKK-003", "Lekki Phase 1, Lagos", "22 Admiralty Way, Lekki", "user-004"),
  b("branch-004", "Ajah Branch", "AJH-004", "Ajah, Lagos", "3 Addo Road, Ajah", "user-005"),
  b("branch-005", "Lagos Island Branch", "LIS-005", "Lagos Island, Lagos", "41 Broad Street, Lagos Island", "user-006"),
  b("branch-006", "Yaba Hub", "YAB-006", "Yaba, Lagos", "9 Herbert Macaulay Way, Yaba", "user-007", "inactive"),
];

const u = (id: string, name: string, role: Role, branchId: string | null): User => ({
  id, tenantId: T, name, role, branchId, status: "active",
  email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@westfield.ng`,
});

const users: User[] = [
  u("user-001", "Marcus Delaney", "owner", null),
  u("user-002", "Amara Okonkwo", "manager", "branch-001"),
  u("user-003", "Folake Adebayo", "manager", "branch-002"),
  u("user-004", "Leo Rahman", "manager", "branch-003"),
  u("user-005", "Nneka Obi", "manager", "branch-004"),
  u("user-006", "Ibrahim Musa", "manager", "branch-005"),
  u("user-007", "Seun Ajayi", "manager", "branch-006"),
  u("user-008", "Kemi Balogun", "manager", null),
  u("user-009", "Uche Nwosu", "manager", null),
  u("user-010", "Tobi Adeyemi", "sales_rep", "branch-001"),
  u("user-011", "Chioma Eze", "sales_rep", "branch-001"),
  u("user-012", "David Okafor", "sales_rep", "branch-001"),
  u("user-013", "Zainab Bello", "sales_rep", "branch-002"),
  u("user-014", "Emeka Johnson", "sales_rep", "branch-002"),
  u("user-015", "Halima Yusuf", "sales_rep", "branch-003"),
  u("user-016", "Chidi Eze", "sales_rep", "branch-003"),
  u("user-017", "Bola Martins", "sales_rep", "branch-004"),
  u("user-018", "Grace Etim", "sales_rep", "branch-004"),
  u("user-019", "Samuel Ogun", "sales_rep", "branch-005"),
  u("user-020", "Ada Nnamdi", "sales_rep", "branch-005"),
  u("user-021", "Kunle Peters", "sales_rep", "branch-006"),
  u("user-022", "Ruth Akpan", "storekeeper", "branch-001"),
  u("user-023", "Yemi Cole", "storekeeper", "branch-002"),
  u("user-024", "Musa Danladi", "storekeeper", "branch-003"),
  u("user-025", "Joy Uzor", "storekeeper", "branch-005"),
];

const p = (id: string, name: string, sku: string, category: string, unitPrice: number): Product => ({ id, tenantId: T, name, sku, category, unitPrice });
const products: Product[] = [
  p("product-001", "iPhone 15 Pro", "APL-IP15P", "Phones", 1_250_000),
  p("product-002", "Galaxy S24", "SMS-S24", "Phones", 980_000),
  p("product-003", "AirPods Pro", "APL-APP2", "Audio", 120_000),
  p("product-004", "AirPods Max", "APL-APM", "Audio", 450_000),
  p("product-005", "Smart Watch S9", "APL-SW9", "Wearables", 320_000),
  p("product-006", "MacBook Air M3", "APL-MBA3", "Computers", 1_650_000),
  p("product-007", "USB-C Charger 30W", "ACC-C30", "Accessories", 25_000),
  p("product-008", "JBL Flip 6", "JBL-F6", "Audio", 95_000),
];

// ---------- deterministic seed helpers (pure arithmetic, safe at module scope) ----------
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

// Product mix weights: cheap items sell far more often.
const productWeights = [0.07, 0.07, 0.24, 0.08, 0.12, 0.03, 0.26, 0.13];
const branchDemand: Record<string, number> = { "branch-001": 1.25, "branch-002": 1.1, "branch-003": 0.95, "branch-004": 0.8, "branch-005": 1.0, "branch-006": 0.7 };

function seedSales(): Sale[] {
  const rand = rng(42);
  const out: Sale[] = [];
  let n = 1;
  const reps = users.filter((x) => x.role === "sales_rep");
  for (let day = 119; day >= 0; day--) {
    const date = addDays(REF, -day);
    for (const branch of branches) {
      if (branch.id === "branch-006" && date > "2026-08-15") continue; // deactivated mid-August
      const branchReps = reps.filter((r) => r.branchId === branch.id);
      const count = Math.round((1 + rand() * 3) * branchDemand[branch.id]);
      for (let i = 0; i < count; i++) {
        let pick = rand(), idx = 0;
        while (idx < productWeights.length - 1 && pick > productWeights[idx]) { pick -= productWeights[idx]; idx++; }
        const product = products[idx];
        const rep = branchReps[Math.floor(rand() * branchReps.length)];
        const hour = 9 + Math.floor(rand() * 10), minute = Math.floor(rand() * 60);
        const statusRoll = rand();
        out.push({
          id: `sale-${String(n).padStart(5, "0")}`, tenantId: T, code: `SAL-${10000 + n}`,
          branchId: branch.id, salesRepId: rep.id, productId: product.id,
          quantity: product.unitPrice > 900_000 ? 1 : 1 + Math.floor(rand() * 4),
          unitPrice: product.unitPrice, saleDate: date,
          createdAt: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
          status: day <= 1 && statusRoll < 0.15 ? "pending" : statusRoll > 0.975 ? "voided" : "completed",
        });
        n++;
      }
    }
  }
  return out;
}

const branchTargetBase: Record<string, number> = {
  "branch-001": 45_000_000, "branch-002": 44_000_000, "branch-003": 42_000_000,
  "branch-004": 38_000_000, "branch-005": 36_000_000, "branch-006": 26_000_000,
};

function seedTargets(): Target[] {
  const out: Target[] = [];
  const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  for (const month of months) {
    for (const branch of branches) {
      const amount = branchTargetBase[branch.id];
      out.push({ id: `target-${branch.id}-${month}`, tenantId: T, scope: "branch", branchId: branch.id, userId: null, month, amount });
      const reps = users.filter((x) => x.role === "sales_rep" && x.branchId === branch.id);
      for (const rep of reps) {
        out.push({ id: `target-${rep.id}-${month}`, tenantId: T, scope: "rep", branchId: branch.id, userId: rep.id, month, amount: Math.round(amount / reps.length / 100_000) * 100_000 });
      }
    }
  }
  return out;
}

function seedInventory(): InventoryRecord[] {
  const rand = rng(7);
  const out: InventoryRecord[] = [];
  for (const branch of branches) {
    for (const product of products) {
      const roll = rand();
      const reorderLevel = product.unitPrice > 900_000 ? 5 : 15;
      const quantity = roll < 0.08 ? 0 : roll < 0.2 ? Math.floor(reorderLevel * rand()) : reorderLevel + Math.floor(rand() * 80);
      out.push({ id: `inv-${branch.id}-${product.id}`, tenantId: T, branchId: branch.id, productId: product.id, quantity, reorderLevel });
    }
  }
  return out;
}

export function createSeedDb(): Db {
  return {
    tenant,
    branches: branches.map((x) => ({ ...x })),
    users: users.map((x) => ({ ...x })),
    products,
    sales: seedSales(),
    inventory: seedInventory(),
    targets: seedTargets(),
    stockRequests: [
      { id: "SR-1092", tenantId: T, branchId: "branch-001", productId: "product-005", quantity: 42, requestedAt: "2026-09-28T08:56:00", priority: "Normal", status: "pending" },
      { id: "SR-1091", tenantId: T, branchId: "branch-003", productId: "product-004", quantity: 15, requestedAt: "2026-09-28T08:32:00", priority: "High", status: "pending" },
      { id: "SR-1088", tenantId: T, branchId: "branch-002", productId: "product-001", quantity: 12, requestedAt: "2026-09-28T08:10:00", priority: "Normal", status: "pending" },
    ],
    activities: [
      { id: "act-003", tenantId: T, action: "Stock request approved", subject: "Ikeja Branch · Smart Watch S9", actorId: "user-002", createdAt: "2026-09-28T09:09:00" },
      { id: "act-002", tenantId: T, action: "New sales rep added", subject: "Lekki Branch · Chidi Eze", actorId: "user-004", createdAt: "2026-09-28T08:14:00" },
      { id: "act-001", tenantId: T, action: "Monthly target updated", subject: "Ajah Branch · ₦38m", actorId: "user-001", createdAt: "2026-09-28T07:14:00" },
    ],
    escalations: [
      { id: "esc-001", tenantId: T, branchId: "branch-004", type: "Target dispute", detail: "Q4 target review requested by manager", createdAt: "2026-09-28T07:14:00", tone: "danger", status: "open" },
      { id: "esc-002", tenantId: T, branchId: "branch-006", type: "Stock delay", detail: "Delivery #882 is four hours overdue", createdAt: "2026-09-28T04:14:00", tone: "warning", status: "open" },
      { id: "esc-003", tenantId: T, branchId: "branch-003", type: "Submission", detail: "3 sales reports still outstanding", createdAt: "2026-09-28T03:14:00", tone: "neutral", status: "open" },
    ],
  };
}
