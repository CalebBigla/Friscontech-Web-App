export type Period = "Day" | "Week" | "Month" | "Quarter";

export const tenant = {
  id: "tenant_westfield_001",
  name: "Westfield Retail",
  fiscalWeek: "W42",
  owner: { id: "usr_001", name: "Marcus Delaney", role: "Owner" },
};

export const metrics = [
  { label: "Total revenue", value: "₦254.4m", detail: "₦218.7m previous period", change: "+12%", tone: "success" },
  { label: "Active branches", value: "12", detail: "All locations operational", change: "100%", tone: "brand" },
  { label: "Team members", value: "84", detail: "Across 12 branches", change: "+6", tone: "violet" },
  { label: "Target attainment", value: "84%", detail: "₦47.8m remaining", change: "+5%", tone: "warning" },
] as const;

export const weeklyRevenue = [42, 55, 48, 72, 64, 88, 76, 93, 84, 108, 97, 118];

export const branchPerformance = [
  { branch: "Ikeja", manager: "Amara Okonkwo", revenue: "₦48.2m", target: "₦45m", progress: 107, status: "Exceeding" },
  { branch: "Victoria Island", manager: "Tobi Adeyemi", revenue: "₦41.8m", target: "₦44m", progress: 95, status: "On pace" },
  { branch: "Lekki", manager: "Leo Rahman", revenue: "₦34.1m", target: "₦42m", progress: 81, status: "Attention" },
  { branch: "Ajah", manager: "Nneka Obi", revenue: "₦28.6m", target: "₦38m", progress: 75, status: "Behind" },
];

export const stockRequests = [
  { id: "SR-1092", branch: "Ikeja", item: "Smart Watch S9", quantity: 42, age: "18m", priority: "Normal" },
  { id: "SR-1091", branch: "Lekki", item: "AirPods Max", quantity: 15, age: "42m", priority: "High" },
  { id: "SR-1088", branch: "Victoria Island", item: "iPhone 15 Pro", quantity: 120, age: "1h", priority: "Normal" },
];

export const alerts = [
  { type: "Target dispute", title: "Ajah branch", detail: "Q4 target review requested by manager", time: "2h ago", tone: "danger" },
  { type: "Stock delay", title: "Yaba hub", detail: "Delivery #882 is four hours overdue", time: "5h ago", tone: "warning" },
  { type: "Submission", title: "Lekki branch", detail: "3 sales reports still outstanding", time: "6h ago", tone: "neutral" },
];

export const inventory = [
  { label: "Healthy stock", value: 88, count: "1,248 SKUs" },
  { label: "Low stock", value: 9, count: "32 items" },
  { label: "Out of stock", value: 3, count: "11 items" },
];

export const activities = [
  { action: "Stock request approved", subject: "Ikeja · Smart Watch S9", actor: "Amara O.", time: "5m" },
  { action: "New sales rep added", subject: "Lekki · Chidi Eze", actor: "Leo R.", time: "1h" },
  { action: "Monthly target updated", subject: "Ajah · ₦38m", actor: "Marcus D.", time: "2h" },
];