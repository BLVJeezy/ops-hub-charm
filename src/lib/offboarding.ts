import { formatCurrency } from "@/lib/format";

export type OffboardService = "social" | "seo" | "website";

export const SERVICE_LABELS: Record<OffboardService, string> = {
  social: "Social media",
  seo: "SEO",
  website: "Website onderhoud/hosting",
};

export type OffboardClientInfo = {
  id: string;
  name: string;
  status: string;
  social_monthly_fee?: number | null;
  social_setup_fee?: number | null;
  social_end_date?: string | null;
  seo_package?: string | null;
  monthly_fee?: number | null;
  yearly_fee?: number | null;
  seo_end_date?: string | null;
  website_monthly_fee?: number | null;
  website_yearly_fee?: number | null;
};

export type OffboardInvoiceItem = {
  id: string;
  invoice_number: number | null;
  date: string;
  total: number;
  credited_amount: number | null;
  status: string;
  repeat_monthly: boolean;
};

export type OffboardAgreementItem = {
  id: string;
  reference: string;
  title: string;
  status: string;
};

export type OffboardContext = {
  client: OffboardClientInfo;
  invoices: OffboardInvoiceItem[];
  repeatingCount: number;
  activeRecurringTasksCount: number;
  openTasks: Array<{ id: string; due_date: string | null }>;
  activeAgreements: OffboardAgreementItem[];
  unfinishedVideos: Array<{ id: string; month: string; status: string }>;
};

export function detectClientServices(
  c: OffboardClientInfo,
  refDate: string,
): { available: OffboardService[]; active: OffboardService[] } {
  const available: OffboardService[] = [];
  const active: OffboardService[] = [];

  const hasSocial = Number(c.social_monthly_fee || 0) > 0 || Number(c.social_setup_fee || 0) > 0;
  if (hasSocial) {
    available.push("social");
    if (!c.social_end_date || c.social_end_date > refDate) active.push("social");
  }

  const hasSeo =
    Number(c.monthly_fee || 0) > 0 ||
    Number(c.yearly_fee || 0) > 0 ||
    (!!c.seo_package && c.seo_package !== "None");
  if (hasSeo) {
    available.push("seo");
    if (!c.seo_end_date || c.seo_end_date > refDate) active.push("seo");
  }

  const hasWebsite = Number(c.website_monthly_fee || 0) > 0 || Number(c.website_yearly_fee || 0) > 0;
  if (hasWebsite) {
    available.push("website");
    active.push("website");
  }

  return { available, active };
}

export function willPauseClient(
  c: OffboardClientInfo,
  selected: OffboardService[],
  allSelected: boolean,
  pauseChecked: boolean,
  endDate: string,
): boolean {
  if (!pauseChecked) return false;
  if (allSelected) return true;

  const newSocialEnd = selected.includes("social") ? endDate : (c.social_end_date ?? null);
  const newSeoEnd = selected.includes("seo") ? endDate : (c.seo_end_date ?? null);
  const newWebM = selected.includes("website") ? null : c.website_monthly_fee;
  const newWebY = selected.includes("website") ? null : c.website_yearly_fee;

  const remSocial = Number(c.social_monthly_fee || 0) > 0 && (!newSocialEnd || newSocialEnd > endDate);
  const remSeo =
    (Number(c.monthly_fee || 0) > 0 ||
      Number(c.yearly_fee || 0) > 0 ||
      (!!c.seo_package && c.seo_package !== "None")) &&
    (!newSeoEnd || newSeoEnd > endDate);
  const remWeb = Number(newWebM || 0) > 0 || Number(newWebY || 0) > 0;

  return !(remSocial || remSeo || remWeb);
}

export function buildOffboardPreviewSummary(input: {
  stopInvoices: boolean;
  repeatingCount: number;
  creditNotes: Array<{ amount: number }>;
  stopTasks: boolean;
  activeRecurringTasksCount: number;
  futureOpenTasksCount: number;
  endAgreements: boolean;
  agreementRefs: string[];
  closeVideos: boolean;
  videosCount: number;
  willPause: boolean;
}): string {
  const parts: string[] = [];

  if (input.stopInvoices && input.repeatingCount > 0) {
    parts.push(`${input.repeatingCount} ${input.repeatingCount === 1 ? "factuur" : "facturen"} stoppen`);
  }

  if (input.creditNotes.length > 0) {
    const total = input.creditNotes.reduce((s, cn) => s + Number(cn.amount || 0), 0);
    parts.push(
      `${input.creditNotes.length} ${input.creditNotes.length === 1 ? "creditnota" : "creditnota's"} ${formatCurrency(total)}`,
    );
  }

  if (input.stopTasks) {
    const totalTasks = input.activeRecurringTasksCount + input.futureOpenTasksCount;
    if (totalTasks > 0) {
      parts.push(`${totalTasks} ${totalTasks === 1 ? "taak" : "taken"} uit`);
    }
  }

  if (input.endAgreements && input.agreementRefs.length > 0) {
    if (input.agreementRefs.length === 1) {
      parts.push(`overeenkomst ${input.agreementRefs[0]} beëindigd`);
    } else {
      parts.push(`${input.agreementRefs.length} overeenkomsten beëindigd`);
    }
  }

  if (input.closeVideos && input.videosCount > 0) {
    parts.push(`${input.videosCount} ${input.videosCount === 1 ? "video-project" : "video-projecten"} verwijderd`);
  }

  if (input.willPause) {
    parts.push("status → Paused");
  }

  return parts.length > 0 ? parts.join(", ") : "Alleen notitie en contactlog worden bijgewerkt";
}