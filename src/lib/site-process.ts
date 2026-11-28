import { isDone, type Group, type View } from "./site-checklist";

export type PhaseId =
  | "website"
  | "bestanden"
  | "domein"
  | "email"
  | "maildomein"
  | "gsc"
  | "gbp"
  | "seo"
  | "oplevering";

export type PhaseStatus = "klaar" | "bezig" | "open" | "geblokkeerd" | "nvt";

export type PhaseDef = {
  id: PhaseId;
  label: string;
  group: Group;
};

export type PhaseView = {
  id: PhaseId;
  label: string;
  group: Group;
  status: PhaseStatus;
  done: number;
  total: number;
  blockers: { label: string; note: string }[];
  missing: string[];
};

export const PHASES: PhaseDef[] = [
  { id: "website", label: "Website", group: "paginas" },
  { id: "bestanden", label: "Bestanden", group: "start" },
  { id: "domein", label: "Domein", group: "domein" },
  { id: "email", label: "E-mail", group: "domein" },
  { id: "maildomein", label: "E-maildomein", group: "domein" },
  { id: "gsc", label: "Search Console", group: "vindbaarheid" },
  { id: "gbp", label: "Bedrijfsprofiel", group: "vindbaarheid" },
  { id: "seo", label: "SEO", group: "vindbaarheid" },
  { id: "oplevering", label: "Oplevering", group: "overdracht" },
];

const KEY_TO_PHASE: Record<string, PhaseId> = {
  "s-bestanden": "bestanden",
  "s-toegang": "domein",
  "d-domein": "domein",
  "d-https": "domein",
  "d-www": "domein",
  "d-mail": "email",
  "d-form": "email",
  "d-spf": "maildomein",
  "d-dmarc": "maildomein",
  "v-gsc": "gsc",
  "v-gbp": "gbp",
  "v-gbp-opt": "gbp",
  "v-meta": "seo",
  "v-og": "seo",
  "v-sitemap": "seo",
  "v-robots": "seo",
  "v-schema": "seo",
  "v-analytics": "seo",
  "v-mobile": "seo",
};

const GROUP_TO_PHASE: Record<Group, PhaseId> = {
  paginas: "website",
  start: "bestanden",
  domein: "domein",
  vindbaarheid: "seo",
  overdracht: "oplevering",
};

function phaseForItem(item: View): PhaseId {
  if (item.custom || item.key.startsWith("x-")) {
    return GROUP_TO_PHASE[item.group];
  }
  return KEY_TO_PHASE[item.key] ?? GROUP_TO_PHASE[item.group];
}

export function phases(items: View[]): PhaseView[] {
  const grouped: Record<PhaseId, View[]> = {
    website: [],
    bestanden: [],
    domein: [],
    email: [],
    maildomein: [],
    gsc: [],
    gbp: [],
    seo: [],
    oplevering: [],
  };

  for (const item of items) {
    grouped[phaseForItem(item)].push(item);
  }

  return PHASES.map((def) => {
    const list = grouped[def.id];
    const counted = list.filter((v) => v.state !== "nvt");
    if (counted.length === 0) {
      return {
        id: def.id,
        label: def.label,
        group: def.group,
        status: "nvt",
        done: 0,
        total: 0,
        blockers: [],
        missing: [],
      };
    }

    const done = counted.filter(isDone).length;
    const total = counted.length;
    const openItems = counted.filter((v) => !isDone(v));
    const blockers = openItems
      .filter((v) => Boolean(v.note?.trim()))
      .map((v) => ({ label: v.label, note: v.note!.trim() }));
    const missing = openItems
      .filter((v) => !v.note?.trim())
      .map((v) => v.label);

    let status: PhaseStatus;
    if (done === total) status = "klaar";
    else if (blockers.length > 0) status = "geblokkeerd";
    else if (done > 0) status = "bezig";
    else status = "open";

    return {
      id: def.id,
      label: def.label,
      group: def.group,
      status,
      done,
      total,
      blockers,
      missing,
    };
  });
}

export function overall(list: PhaseView[]): { klaar: number; total: number; live: boolean } {
  const active = list.filter((p) => p.status !== "nvt");
  const klaar = active.filter((p) => p.status === "klaar").length;
  const total = active.length;
  return { klaar, total, live: total > 0 && klaar === total };
}

export function nextStep(list: PhaseView[]): PhaseView | null {
  return list.find((p) => p.status !== "klaar" && p.status !== "nvt") ?? null;
}