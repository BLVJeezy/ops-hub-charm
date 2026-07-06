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
