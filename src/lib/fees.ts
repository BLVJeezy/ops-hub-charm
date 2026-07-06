// Fee computation helpers

export function computeMonthly(freq: string, monthly?: number | null, yearly?: number | null): number {
  const m = Number(monthly || 0);
  const y = Number(yearly || 0);
  if (freq === "Yearly") return y > 0 ? y / 12 : m;
  return m > 0 ? m : y / 12;
}

export function computeMRR(client: {
  billing_frequency?: string | null;
  monthly_fee?: number | null;
  yearly_fee?: number | null;
  website_billing_frequency?: string | null;
  website_monthly_fee?: number | null;
  website_yearly_fee?: number | null;
  website_needed?: boolean | null;
}): number {
  const seo = computeMonthly(client.billing_frequency || "Monthly", client.monthly_fee, client.yearly_fee);
  const web = client.website_needed
    ? computeMonthly(client.website_billing_frequency || "Monthly", client.website_monthly_fee, client.website_yearly_fee)
    : 0;
  return seo + web;
}

// Auto-fill counterpart fee when user edits one side (frequency-aware, no discount)
export function autoFillYearly(monthly?: number | null): number | null {
  const m = Number(monthly || 0);
  return m > 0 ? Math.round(m * 12) : null;
}

export function autoFillMonthly(yearly?: number | null): number | null {
  const y = Number(yearly || 0);
  return y > 0 ? Math.round((y / 12) * 100) / 100 : null;
}

// ===== Spec-accurate helpers (Solyn spec §4.8–§4.12) =====

export type FeeClient = {
  status?: string | null;
  billing_frequency?: string | null;
  monthly_fee?: number | null;
  yearly_fee?: number | null;
  setup_fee?: number | null;
  website_billing_frequency?: string | null;
  website_monthly_fee?: number | null;
  website_yearly_fee?: number | null;
  website_setup_fee?: number | null;
  seo_start_date?: string | null;
  seo_end_date?: string | null;
  contract_start_date?: string | null;
};

function seoEnded(c: FeeClient): boolean {
  return !!c.seo_end_date && new Date(c.seo_end_date) < new Date();
}

/** §4.8 — MRR per client: SEO (unless ended) + Website, yearly fees /12 */
export function clientMRR(c: FeeClient): number {
  let mrr = 0;
  if (!seoEnded(c)) {
    if (c.billing_frequency === "Yearly" && Number(c.yearly_fee)) mrr += Number(c.yearly_fee) / 12;
    else mrr += Number(c.monthly_fee || 0);
  }
  if (c.website_billing_frequency === "Yearly" && Number(c.website_yearly_fee)) mrr += Number(c.website_yearly_fee) / 12;
  else mrr += Number(c.website_monthly_fee || 0);
  return mrr;
}

/** §4.9 — only Monthly-billed fees (for margin calcs) */
export function clientMonthlyFee(c: FeeClient): number {
  let fee = 0;
  if (!seoEnded(c) && c.billing_frequency === "Monthly") fee += Number(c.monthly_fee || 0);
  if (c.website_billing_frequency === "Monthly") fee += Number(c.website_monthly_fee || 0);
  return fee;
}

/** §4.16 — contract-based revenue for a given calendar month (0-indexed month) */
export function clientRevenueForMonth(c: FeeClient, year: number, month: number): number {
  if (c.status !== "Active" && c.status !== "Paused") return 0;
  if (!c.contract_start_date && !c.seo_start_date) return 0;
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0);
  let rev = 0;

  // SEO
  if (c.seo_start_date) {
    const s = new Date(c.seo_start_date);
    const e = c.seo_end_date ? new Date(c.seo_end_date) : null;
    const startedByMonth = s <= mEnd;
    const notEnded = !e || e >= mStart;
    if (startedByMonth && notEnded) {
      const isStartMonth = s.getFullYear() === year && s.getMonth() === month;
      if (c.billing_frequency === "Yearly") {
        if (isStartMonth) rev += Number(c.yearly_fee || 0);
      } else {
        rev += Number(c.monthly_fee || 0);
      }
      if (isStartMonth) rev += Number(c.setup_fee || 0);
    }
  }

  // Website
  if (c.contract_start_date) {
    const s = new Date(c.contract_start_date);
    if (s <= mEnd) {
      const isStartMonth = s.getFullYear() === year && s.getMonth() === month;
      if (c.website_billing_frequency === "Yearly") {
        if (isStartMonth) rev += Number(c.website_yearly_fee || 0);
      } else {
        rev += Number(c.website_monthly_fee || 0);
      }
      if (isStartMonth) rev += Number(c.website_setup_fee || 0);
    }
  }

  return rev;
}
