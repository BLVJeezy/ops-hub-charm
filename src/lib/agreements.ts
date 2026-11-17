// Samenwerkingsovereenkomsten: template text (pure, tested in agreements.test.ts) and the PDF.
// Body format: "## " = article heading, "- " = bullet, blank line = paragraph break.
import { COMPANY } from "./constants";

export interface SocialAgreementInput {
  reference: string;
  clientName: string; // legal name of the client
  tradeName?: string | null; // brand, if different
  address?: string | null;
  vatNumber?: string | null;
  representative?: string | null;
  startDate: string | null; // YYYY-MM-DD; null = the agreement starts when the first payment is received
  monthlyFee: number; // excl. VAT
  videosPerMonth: number;
  revisionsPerVideo: number;
  noticeMonths?: number;
  /** the videos are delivered within this many days after payment */
  deliveryDays?: number | null;
}

const eur = (n: number) => `€ ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateNl = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" });

export function socialAgreementTitle(i: SocialAgreementInput): string {
  return `Samenwerkingsovereenkomst social media – ${i.tradeName || i.clientName}`;
}

export function socialAgreementBody(i: SocialAgreementInput): string {
  const notice = i.noticeMonths ?? 1;
  const rev = i.revisionsPerVideo === 1 ? "één (1) revisieronde" : `${i.revisionsPerVideo} revisierondes`;
  const party = [
    i.clientName + (i.tradeName && i.tradeName !== i.clientName ? `, handelend onder de naam ${i.tradeName}` : ""),
    i.address ? `met zetel te ${i.address}` : null,
    i.vatNumber ? `ondernemingsnummer ${i.vatNumber}` : null,
    `vertegenwoordigd door ${i.representative || "………………………………"}`,
  ].filter(Boolean).join(", ");

  return `Referentie: ${i.reference}

## Partijen
${COMPANY.name}, met zetel te ${COMPANY.address}, ingeschreven onder bedrijfsnummer ${COMPANY.companyNumber}, vertegenwoordigd door Jason Balongo, hierna "Solyn Global" of "de Dienstverlener";

en

${party}, hierna "de Opdrachtgever".

## Artikel 1 – Voorwerp
Solyn Global maakt voor de Opdrachtgever korte video's voor gebruik op social media (zoals Instagram, TikTok en Facebook). Per kalendermaand levert Solyn Global ${i.videosPerMonth} video's af.

## Artikel 2 – Werkwijze en levering
- De onderwerpen en de planning van de video's worden in onderling overleg vastgelegd.
- De Opdrachtgever bezorgt tijdig het nodige materiaal, de toegang tot de locatie en de informatie die nodig is om de video's te maken.
- De video's worden digitaal afgeleverd in een formaat dat geschikt is voor social media${i.deliveryDays ? `, binnen ${i.deliveryDays} dagen na ontvangst van de betaling` : ""}.
- Video's die in een maand niet geleverd konden worden door een oorzaak bij de Opdrachtgever, worden niet overgedragen naar een volgende maand, tenzij partijen dit schriftelijk anders afspreken.

## Artikel 3 – Revisies
Per video is ${rev} inbegrepen. Een revisie wordt binnen 7 dagen na levering aangevraagd, met concrete opmerkingen in één bericht. Een video zonder revisieverzoek binnen die termijn geldt als goedgekeurd. Bijkomende revisies of nieuwe wijzigingen na goedkeuring gebeuren enkel na akkoord over een meerprijs.

## Artikel 4 – Vergoeding en betaling
- De vergoeding bedraagt ${eur(i.monthlyFee)} per maand, exclusief btw, voor ${i.videosPerMonth} video's.
- De vergoeding wordt vooraf betaald: Solyn Global factureert maandelijks, en de betaling wordt ontvangen vóór de aanvang van de betrokken maand. De productie van een maand start na ontvangst van de betaling.
- Btw: Solyn Global is gevestigd in het Verenigd Koninkrijk; de btw wordt verlegd naar de Opdrachtgever (verleggingsregeling), tenzij de wet anders bepaalt.
- Bij laattijdige betaling kan Solyn Global de levering opschorten tot de betaling ontvangen is.

## Artikel 5 – Duur en opzegging
Deze overeenkomst start ${i.startDate ? `op ${dateNl(i.startDate)}` : "op de dag waarop Solyn Global de eerste betaling ontvangt"} en geldt voor onbepaalde duur. Elke partij kan de overeenkomst schriftelijk (ook per e-mail) opzeggen met een opzegtermijn van ${notice} ${notice === 1 ? "maand" : "maanden"}. Reeds betaalde maanden worden volledig uitgevoerd; betaalde bedragen worden niet terugbetaald.

## Artikel 6 – Gebruiksrecht
Na volledige betaling verkrijgt de Opdrachtgever het recht om de geleverde video's onbeperkt in tijd te gebruiken op zijn eigen kanalen en in zijn eigen communicatie. Solyn Global mag de video's tonen in haar portfolio, tenzij de Opdrachtgever daar schriftelijk bezwaar tegen maakt. Ruwe beeldopnames en werkbestanden blijven bij Solyn Global, tenzij anders afgesproken.

## Artikel 7 – Verantwoordelijkheid voor inhoud
De Opdrachtgever staat in voor de rechten op het materiaal dat hij aanlevert (logo's, muziek, foto's) en voor de toestemming van personen die herkenbaar in beeld komen, waaronder personeel en klanten. De Opdrachtgever keurt de inhoud goed vóór publicatie en blijft verantwoordelijk voor wat hij publiceert.

## Artikel 8 – Aansprakelijkheid
De aansprakelijkheid van Solyn Global is beperkt tot de vergoeding die de Opdrachtgever betaalde voor de drie maanden voorafgaand aan de schadeveroorzakende gebeurtenis. Solyn Global is niet aansprakelijk voor de resultaten van publicaties (zoals bereik, volgers of omzet) of voor wijzigingen en storingen van social-mediaplatformen.

## Artikel 9 – Vertrouwelijkheid en persoonsgegevens
Partijen behandelen vertrouwelijke informatie van de andere partij vertrouwelijk. Persoonsgegevens worden enkel verwerkt voor de uitvoering van deze overeenkomst en in overeenstemming met de AVG (GDPR).

## Artikel 10 – Toepasselijk recht
Op deze overeenkomst is Belgisch recht van toepassing voor zover wettelijk toegestaan. Geschillen worden eerst minnelijk besproken; voor zover rechtsgeldig overeengekomen is de ondernemingsrechtbank van het rechtsgebied van de maatschappelijke zetel van de Opdrachtgever bevoegd.

## Artikel 11 – Wijzigingen
Wijzigingen of aanvullingen gelden enkel als beide partijen ze schriftelijk (ook per e-mail) bevestigen.`;
}

export type AgreementBlock = { type: "h" | "p" | "li"; text: string };

/** Split a body into headings, paragraphs and bullets (shared by the viewer and the PDF). */
export function parseAgreement(body: string): AgreementBlock[] {
  const out: AgreementBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ type: "p", text: para.join(" ") }); para = []; } };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("## ")) { flush(); out.push({ type: "h", text: line.slice(3) }); }
    else if (line.startsWith("- ")) { flush(); out.push({ type: "li", text: line.slice(2) }); }
    else para.push(line);
  }
  flush();
  return out;
}

export async function downloadAgreementPDF(a: { reference: string; title: string; body: string; clientName: string; representative?: string | null; place?: string }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 20, R = 190, W = R - L, BOTTOM = 280;
  let y = 22;
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 22; } };

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(150, 120, 50);
  doc.text("SOLYN GLOBAL", L, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(120);
  doc.text(a.reference, R, y, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(30);
  for (const l of doc.splitTextToSize(a.title, W)) { doc.text(l, L, y); y += 7; }
  y += 3;

  for (const b of parseAgreement(a.body)) {
    if (b.text.startsWith("Referentie:")) continue;
    if (b.type === "h") {
      ensure(14); y += 3;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30);
      doc.text(b.text, L, y); y += 6;
    } else {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50);
      const indent = b.type === "li" ? 5 : 0;
      const lines = doc.splitTextToSize(b.text, W - indent);
      ensure(lines.length * 5 + 2);
      if (b.type === "li") doc.text("•", L + 1, y);
      for (const l of lines) { doc.text(l, L + indent, y); y += 5; }
      y += 2;
    }
  }

  // signatures
  ensure(60); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50);
  doc.text(`Opgemaakt in twee exemplaren te ${a.place ?? "Tongeren"} op ……………………, waarvan elke partij er één ontvangt.`, L, y);
  y += 14;
  const col = (x: number, who: string, name: string) => {
    doc.setFont("helvetica", "bold"); doc.text(who, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(name, x, y + 6);
    doc.setDrawColor(180); doc.line(x, y + 26, x + 70, y + 26);
    doc.setFontSize(8); doc.setTextColor(120); doc.text("Handtekening, voorafgegaan door \"gelezen en goedgekeurd\"", x, y + 31);
    doc.setFontSize(10); doc.setTextColor(50);
  };
  col(L, "Voor Solyn Global", "Jason Balongo");
  col(L + 90, "Voor de Opdrachtgever", a.representative ? `${a.representative} – ${a.clientName}` : a.clientName);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`${COMPANY.name} · ${a.reference} · pagina ${i}/${pages}`, 105, 290, { align: "center" });
  }
  doc.save(`${a.reference} ${a.clientName}.pdf`.replace(/[\\/:*?"<>|]/g, ""));
}
