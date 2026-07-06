export const CLIENT_STATUSES = ["Prospect", "Active", "Paused", "Write-off"] as const;
export const PIPELINE_STAGES = [
  "Found", "Contacted", "Interested", "Meeting Booked",
  "Meeting Done", "Proposal Sent", "Negotiating", "Converted", "Write-off",
] as const;
export const CLIENT_SECTORS = [
  "Plumber", "Electrician", "HVAC", "Construction",
  "Cleaning", "Medical/Wholesale", "Car Detailing", "Other",
] as const;
export const WRITEOFF_REASONS = ["No response", "Too expensive", "Not interested", "Bad fit", "Other"] as const;
export const HEALTH_STATUSES = ["Not set", "Green", "Orange", "Red"] as const;
export const BILLING_FREQUENCIES = ["Monthly", "Yearly"] as const;
export const SEO_PACKAGES = ["None", "Basic", "Premium", "Custom", "Pilot"] as const;
export const INVOICE_STATUSES = ["Draft", "Sent", "Paid"] as const;
export const EXPENSE_CATEGORIES = ["Tool", "Directory/Citations", "Subscription", "Other"] as const;
export const WAITING_PERIODS = ["1 week", "2 weeks", "3 weeks", "4 weeks", "Ongoing"] as const;
export const ACTION_STATUSES = ["Planned", "In Progress", "Completed", "Blocked"] as const;
export const CONTACT_CHANNELS = ["WhatsApp", "Phone", "Email", "In person", "Other"] as const;
export const CONTACT_DIRECTIONS = ["Outreach", "Response"] as const;
export const REVIEW_STATUSES = ["Pending", "Approved", "Rejected"] as const;

export const WAITING_PERIOD_DAYS: Record<string, number | null> = {
  "1 week": 7, "2 weeks": 14, "3 weeks": 21, "4 weeks": 28, Ongoing: null,
};

export const STATUS_COLORS: Record<string, string> = {
  Prospect: "#B7BCC2", Active: "#22C55E", Paused: "#F59E0B", "Write-off": "#EF4444",
};
export const STAGE_COLORS: Record<string, string> = {
  Found: "#B7BCC2", Contacted: "#94A3B8", Interested: "#60A5FA",
  "Meeting Booked": "#60A5FA", "Meeting Done": "#A78BFA",
  "Proposal Sent": "#C9A24B", Negotiating: "#C9A24B",
  Converted: "#22C55E", "Write-off": "#EF4444",
};
export const HEALTH_COLORS: Record<string, string> = {
  "Not set": "#6E747C", Green: "#22C55E", Orange: "#F59E0B", Red: "#EF4444",
};
export const ACTION_STATUS_COLORS: Record<string, string> = {
  Planned: "#94A3B8", "In Progress": "#60A5FA", Completed: "#22C55E", Blocked: "#EF4444",
};
export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  Tool: "#60A5FA", "Directory/Citations": "#A78BFA",
  Subscription: "#C9A24B", Other: "#B7BCC2",
};

export const COMPANY = {
  name: "Solyn Global LTD",
  address: "71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom",
  companyNumber: "16876148",
  iban: "GB50REVO23012053167437",
  bic: "REVOGB21",
};

export const PIN_CODE = "943528";
export const PIN_STORAGE_KEY = "solyn_pin_unlocked";
