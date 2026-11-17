import { describe, expect, it } from "vitest";
import { parseAgreement, socialAgreementBody, socialAgreementTitle } from "./agreements";

const input = {
  reference: "SG-SM-2026-001",
  clientName: "SRL Energy Life",
  tradeName: "DynaMik",
  address: "Kleinstraat 22, 3700 Tongeren",
  vatNumber: "BE0839.060.292",
  representative: "Michael Van Immerseel",
  startDate: "2026-11-16",
  monthlyFee: 150,
  videosPerMonth: 11,
  revisionsPerVideo: 1,
};

describe("social media agreement", () => {
  const body = socialAgreementBody(input);
  it("names both parties and the brand", () => {
    expect(socialAgreementTitle(input)).toBe("Samenwerkingsovereenkomst social media – DynaMik");
    expect(body).toContain("Solyn Global LTD");
    expect(body).toContain("SRL Energy Life, handelend onder de naam DynaMik");
    expect(body).toContain("BE0839.060.292");
    expect(body).toContain("Michael Van Immerseel");
  });
  it("states the deal: 11 videos, one revision each, €150 paid before the month starts", () => {
    expect(body).toContain("Per maand levert Solyn Global 11 video's af");
    expect(body).toContain("één (1) revisieronde");
    expect(body).toContain("€ 150,00 per maand, exclusief btw");
    expect(body).toContain("vóór de aanvang van de betrokken maand");
    expect(body).toContain("16 november 2026");
  });
  it("leaves a blank for an unknown representative", () => {
    expect(socialAgreementBody({ ...input, representative: null })).toContain("vertegenwoordigd door ………");
  });
  it("parses into headings, paragraphs and bullets", () => {
    const blocks = parseAgreement(body);
    expect(blocks.filter((b) => b.type === "h").length).toBe(14);
    expect(blocks.some((b) => b.type === "li" && b.text.startsWith("De vergoeding bedraagt"))).toBe(true);
  });
  it("can start on the first payment and promise delivery within 30 days", () => {
    const b = socialAgreementBody({ ...input, startDate: null, deliveryDays: 30 });
    expect(b).toContain("start op de dag waarop Solyn Global de eerste betaling ontvangt");
    expect(b).toContain("binnen 30 dagen na ontvangst van de betaling");
    expect(b).toContain("€ 150,00 per maand, exclusief btw, voor 11 video's");
  });
  it("hands the delivered videos to the client, while Solyn may use them for its own promotion", () => {
    expect(body).toContain("Zodra de video's zijn afgeleverd, zijn ze volledig van de Opdrachtgever");
    expect(body).toContain("eigen reclame, haar eigen content en haar eigen promotiemateriaal");
    expect(body).not.toContain("bezwaar");
  });
  it("gives Solyn full creative freedom", () => {
    expect(body).toContain("Solyn Global heeft volledige creatieve vrijheid");
  });
  it("can be a one-month trial that the parties extend in writing", () => {
    const b = socialAgreementBody({ ...input, startDate: null, trialMonths: 1 });
    expect(b).toContain("## Artikel 5 – Proefperiode, verlenging en opzegging");
    expect(b).toContain("proefperiode van één (1) maand en start op de dag waarop Solyn Global de eerste betaling ontvangt");
    expect(b).toContain("Zonder verlenging eindigt de overeenkomst na de proefperiode");
    expect(socialAgreementBody(input)).toContain("## Artikel 5 – Duur en opzegging");
  });
  it("lists both companies' details and the bank accounts", () => {
    const b = socialAgreementBody({ ...input, email: "michael@example.be" });
    expect(b).toContain("## Gegevens van Solyn Global");
    expect(b).toContain("Rekeningnummer: GB50 REVO 2301 2053 1674 37 (BIC REVOGB21)");
    expect(b).toContain("Belgische rekening: BE48 7390 2803 5627 (KBC Bank, BIC KREDBEBB)");
    expect(b).toContain("## Gegevens van de Opdrachtgever");
    expect(b).toContain("- Ondernemingsnummer / btw: BE0839.060.292");
    expect(b).toContain("- E-mail: michael@example.be");
    expect(b).toContain("met vermelding van het factuurnummer");
  });
  it("has a French version, article for article", () => {
    const nl = socialAgreementBody({ ...input, startDate: null, trialMonths: 1, deliveryDays: 30 });
    const fr = socialAgreementBody({ ...input, startDate: null, trialMonths: 1, deliveryDays: 30, lang: "fr" });
    expect(socialAgreementTitle({ ...input, lang: "fr" })).toBe("Contrat de collaboration réseaux sociaux – DynaMik");
    expect(parseAgreement(fr).filter((b) => b.type === "h").length).toBe(parseAgreement(nl).filter((b) => b.type === "h").length);
    expect(fr).toContain("150,00 € par mois, hors TVA, pour 11 vidéos");
    expect(fr).toContain("totale liberté créative");
    expect(fr).toContain("période d'essai d'un (1) mois et prend effet le jour où Solyn Global reçoit le premier paiement");
    expect(fr).toContain("dans les 30 jours suivant la réception du paiement");
    expect(fr).toContain("BE48 7390 2803 5627");
    expect(fr).toContain("propre matériel promotionnel");
    expect(fr).toContain("moyennant un préavis d'un (1) mois");
    expect(fr).not.toContain("de un");
  });
});
