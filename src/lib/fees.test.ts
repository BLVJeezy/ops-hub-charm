import { describe, expect, it } from "vitest";
import { clientMRR, clientMonthlyFee, clientRevenueForMonth, socialMonthly } from "./fees";

const base = { status: "Active", billing_frequency: "Monthly", monthly_fee: 500, website_billing_frequency: "Monthly", website_monthly_fee: 60 };

describe("social media fee", () => {
  it("adds to MRR and to the monthly fee", () => {
    expect(clientMRR(base)).toBe(560);
    expect(clientMRR({ ...base, social_monthly_fee: 250 })).toBe(810);
    expect(clientMonthlyFee({ ...base, social_monthly_fee: 250 })).toBe(810);
  });

  it("stops counting after its end date", () => {
    expect(socialMonthly({ social_monthly_fee: 250, social_end_date: "2020-01-31" })).toBe(0);
    expect(socialMonthly({ social_monthly_fee: 250, social_end_date: "2999-01-31" })).toBe(250);
    expect(clientMRR({ ...base, social_monthly_fee: 250, social_end_date: "2020-01-31" })).toBe(560);
  });

  it("books revenue from its start month, with the setup fee once", () => {
    const c = { status: "Active", social_monthly_fee: 250, social_setup_fee: 100, social_start_date: "2026-03-10" };
    expect(clientRevenueForMonth(c, 2026, 1)).toBe(0);
    expect(clientRevenueForMonth(c, 2026, 2)).toBe(350);
    expect(clientRevenueForMonth(c, 2026, 3)).toBe(250);
  });

  it("leaves clients without social media unchanged", () => {
    const c = { ...base, seo_start_date: "2026-01-01", contract_start_date: "2026-01-01" };
    expect(clientRevenueForMonth(c, 2026, 4)).toBe(560);
  });
});

import { clientMRRBreakdown, serviceMRR } from "./fees";
describe("MRR per service", () => {
  it("splits a client's MRR into SEO, website and social media", () => {
    expect(clientMRRBreakdown({ monthly_fee: 500, website_billing_frequency: "Yearly", website_yearly_fee: 1200, social_monthly_fee: 150 }))
      .toEqual({ seo: 500, website: 100, social: 150 });
  });
  it("totals per service and counts paying clients", () => {
    const s = serviceMRR([{ monthly_fee: 500 }, { social_monthly_fee: 150 }, { social_monthly_fee: 150, website_monthly_fee: 385 }]);
    expect(s.seo).toEqual({ mrr: 500, clients: 1 });
    expect(s.website).toEqual({ mrr: 385, clients: 1 });
    expect(s.social).toEqual({ mrr: 300, clients: 2 });
  });
});
