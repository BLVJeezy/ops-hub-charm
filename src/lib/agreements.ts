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
  email?: string | null;
  phone?: string | null;
  startDate: string | null; // YYYY-MM-DD; null = the agreement starts when the first payment is received
  monthlyFee: number; // excl. VAT
  videosPerMonth: number;
  revisionsPerVideo: number;
  noticeMonths?: number;
  /** a trial of this many months that the parties can extend; empty = open-ended from the start */
  trialMonths?: number | null;
  /** the videos are delivered within this many days after payment */
  deliveryDays?: number | null;
  /** language of the agreement; default Dutch */
  lang?: "nl" | "fr";
}

const eur = (n: number) => `€ ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateNl = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" });

export function socialAgreementTitle(i: SocialAgreementInput): string {
  return i.lang === "fr" ? `Contrat de collaboration réseaux sociaux – ${i.tradeName || i.clientName}` : `Samenwerkingsovereenkomst social media – ${i.tradeName || i.clientName}`;
}

export function socialAgreementBody(i: SocialAgreementInput): string {
  if (i.lang === "fr") return socialAgreementBodyFr(i);
  const notice = i.noticeMonths ?? 1;
  const rev = i.revisionsPerVideo === 1 ? "één (1) revisieronde" : `${i.revisionsPerVideo} revisierondes`;
  const party = [
    i.clientName + (i.tradeName && i.tradeName !== i.clientName ? `, handelend onder de naam ${i.tradeName}` : ""),
    i.address ? `met zetel te ${i.address}` : null,
    i.vatNumber ? `ondernemingsnummer ${i.vatNumber}` : null,
    `vertegenwoordigd door ${i.representative || "………………………………"}`,
  ].filter(Boolean).join(", ");

  const blank = "………………………………";
  const iban = (s: string) => s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  const clientData = [
    `- Naam: ${i.clientName}${i.tradeName && i.tradeName !== i.clientName ? ` (handelsnaam ${i.tradeName})` : ""}`,
    `- Adres: ${i.address || blank}`,
    `- Ondernemingsnummer / btw: ${i.vatNumber || blank}`,
    `- Vertegenwoordigd door: ${i.representative || blank}`,
    `- E-mail: ${i.email || blank}`,
    ...(i.phone ? [`- Telefoon: ${i.phone}`] : []),
  ].join("\n");

  return `Referentie: ${i.reference}

## Partijen
${COMPANY.name}, met zetel te ${COMPANY.address}, ingeschreven onder bedrijfsnummer ${COMPANY.companyNumber}, vertegenwoordigd door Jason Balongo, hierna "Solyn Global" of "de Dienstverlener";

en

${party}, hierna "de Opdrachtgever".

## Gegevens van Solyn Global
- Naam: ${COMPANY.name}
- Adres: ${COMPANY.address}
- Bedrijfsnummer (Companies House, VK): ${COMPANY.companyNumber}
- Vertegenwoordigd door: Jason Balongo
- E-mail: jason@solynglobal.be
- Rekeningnummer: ${iban(COMPANY.iban)} (BIC ${COMPANY.bic}), op naam van ${COMPANY.name}
- Belgische rekening: ${iban(COMPANY.beIban)} (${COMPANY.beBank}, BIC ${COMPANY.beBic}), op naam van ${COMPANY.beName}

## Gegevens van de Opdrachtgever
${clientData}

## Artikel 1 – Voorwerp
Solyn Global maakt voor de Opdrachtgever korte video's voor gebruik op social media (zoals Instagram, TikTok en Facebook). Per maand levert Solyn Global ${i.videosPerMonth} video's af.

## Artikel 2 – Werkwijze en levering
- Solyn Global heeft volledige creatieve vrijheid bij het maken van de video's, zoals de keuze van onderwerpen, stijl, muziek en montage. De Opdrachtgever kan vooraf wensen of aandachtspunten doorgeven; Solyn Global houdt daar zo veel mogelijk rekening mee.
- De Opdrachtgever bezorgt tijdig het nodige materiaal, de toegang tot de locatie en de informatie die nodig is om de video's te maken.
- De video's worden digitaal afgeleverd in een formaat dat geschikt is voor social media${i.deliveryDays ? `, binnen ${i.deliveryDays} dagen na ontvangst van de betaling` : ""}.
- Video's die in een maand niet geleverd konden worden door een oorzaak bij de Opdrachtgever, worden niet overgedragen naar een volgende maand, tenzij partijen dit schriftelijk anders afspreken.

## Artikel 3 – Revisies
Per video is ${rev} inbegrepen. Een revisie wordt binnen 7 dagen na levering aangevraagd, met concrete opmerkingen in één bericht. Een video zonder revisieverzoek binnen die termijn geldt als goedgekeurd. Bijkomende revisies of nieuwe wijzigingen na goedkeuring gebeuren enkel na akkoord over een meerprijs.

## Artikel 4 – Vergoeding en betaling
- De vergoeding bedraagt ${eur(i.monthlyFee)} per maand, exclusief btw, voor ${i.videosPerMonth} video's.
- De vergoeding wordt vooraf betaald: Solyn Global factureert maandelijks, en de betaling wordt ontvangen vóór de aanvang van de betrokken maand. De productie van een maand start na ontvangst van de betaling.
- Btw: Solyn Global is gevestigd in het Verenigd Koninkrijk; de btw wordt verlegd naar de Opdrachtgever (verleggingsregeling), tenzij de wet anders bepaalt.
- Betalingen gebeuren op een van de rekeningen van Solyn Global vermeld bij "Gegevens van Solyn Global", met vermelding van het factuurnummer.
- Bij laattijdige betaling kan Solyn Global de levering opschorten tot de betaling ontvangen is.

## Artikel 5 – ${i.trialMonths ? "Proefperiode, verlenging en opzegging" : "Duur en opzegging"}
${i.trialMonths
  ? `Deze overeenkomst geldt als proefperiode van ${i.trialMonths === 1 ? "één (1) maand" : `${i.trialMonths} maanden`} en start ${i.startDate ? `op ${dateNl(i.startDate)}` : "op de dag waarop Solyn Global de eerste betaling ontvangt"}. Na de proefperiode kan de samenwerking verlengd worden; partijen bevestigen de verlenging schriftelijk (ook per e-mail). Zonder verlenging eindigt de overeenkomst na de proefperiode. Na verlenging loopt de overeenkomst maandelijks verder onder dezelfde voorwaarden, en kan elke partij ze schriftelijk opzeggen met een opzegtermijn van ${notice} ${notice === 1 ? "maand" : "maanden"}. Reeds betaalde maanden worden volledig uitgevoerd; betaalde bedragen worden niet terugbetaald.`
  : `Deze overeenkomst start ${i.startDate ? `op ${dateNl(i.startDate)}` : "op de dag waarop Solyn Global de eerste betaling ontvangt"} en geldt voor onbepaalde duur. Elke partij kan de overeenkomst schriftelijk (ook per e-mail) opzeggen met een opzegtermijn van ${notice} ${notice === 1 ? "maand" : "maanden"}. Reeds betaalde maanden worden volledig uitgevoerd; betaalde bedragen worden niet terugbetaald.`}

## Artikel 6 – Eigendom en gebruik
Zodra de video's zijn afgeleverd, zijn ze volledig van de Opdrachtgever: de vermogensrechten op de geleverde video's gaan over op de Opdrachtgever, die ze onbeperkt in tijd en op elke manier mag gebruiken, aanpassen en verspreiden. Solyn Global behoudt wel het recht om de video's kosteloos te gebruiken voor haar eigen reclame, haar eigen content en haar eigen promotiemateriaal, zoals haar website, social media en portfolio. Ruwe beeldopnames en werkbestanden blijven bij Solyn Global, tenzij anders afgesproken.

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

const eurFr = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ")} €`;
const dateFr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });

/** The same agreement in French (for clients in Wallonia or Brussels). Kept article for article in step with the Dutch text. */
function socialAgreementBodyFr(i: SocialAgreementInput): string {
  i = { ...i, address: i.address?.replace(/,?\s*België$/i, ", Belgique") ?? i.address };
  const notice = i.noticeMonths ?? 1;
  const blank = "………………………………";
  const iban = (s: string) => s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  const rev = i.revisionsPerVideo === 1 ? "une (1) série de corrections" : `${i.revisionsPerVideo} séries de corrections`;
  const ofMonths = (n: number) => (n === 1 ? "d'un (1) mois" : `de ${n} mois`);   // "de" + "un" elides to "d'un"
  const start = i.startDate ? `le ${dateFr(i.startDate)}` : "le jour où Solyn Global reçoit le premier paiement";
  const party = [
    i.clientName + (i.tradeName && i.tradeName !== i.clientName ? `, agissant sous le nom commercial ${i.tradeName}` : ""),
    i.address ? `dont le siège est situé ${i.address}` : null,
    i.vatNumber ? `numéro d'entreprise ${i.vatNumber}` : null,
    `représentée par ${i.representative || blank}`,
  ].filter(Boolean).join(", ");
  const clientData = [
    `- Nom : ${i.clientName}${i.tradeName && i.tradeName !== i.clientName ? ` (nom commercial ${i.tradeName})` : ""}`,
    `- Adresse : ${i.address || blank}`,
    `- Numéro d'entreprise / TVA : ${i.vatNumber || blank}`,
    `- Représentée par : ${i.representative || blank}`,
    `- E-mail : ${i.email || blank}`,
    ...(i.phone ? [`- Téléphone : ${i.phone}`] : []),
  ].join("\n");

  return `Référence : ${i.reference}

## Parties
${COMPANY.name}, dont le siège est situé ${COMPANY.address}, immatriculée sous le numéro ${COMPANY.companyNumber}, représentée par Jason Balongo, ci-après « Solyn Global » ou « le Prestataire » ;

et

${party}, ci-après « le Client ».

## Coordonnées de Solyn Global
- Nom : ${COMPANY.name}
- Adresse : ${COMPANY.address}
- Numéro de société (Companies House, Royaume-Uni) : ${COMPANY.companyNumber}
- Représentée par : Jason Balongo
- E-mail : jason@solynglobal.be
- Numéro de compte : ${iban(COMPANY.iban)} (BIC ${COMPANY.bic}), au nom de ${COMPANY.name}
- Compte belge : ${iban(COMPANY.beIban)} (${COMPANY.beBank}, BIC ${COMPANY.beBic}), au nom de ${COMPANY.beName}

## Coordonnées du Client
${clientData}

## Article 1 – Objet
Solyn Global réalise pour le Client de courtes vidéos destinées aux réseaux sociaux (tels qu'Instagram, TikTok et Facebook). Solyn Global livre ${i.videosPerMonth} vidéos par mois.

## Article 2 – Méthode de travail et livraison
- Solyn Global dispose d'une totale liberté créative pour la réalisation des vidéos, notamment pour le choix des sujets, du style, de la musique et du montage. Le Client peut communiquer au préalable ses souhaits ou points d'attention ; Solyn Global en tient compte dans la mesure du possible.
- Le Client fournit en temps utile le matériel nécessaire, l'accès aux lieux et les informations nécessaires à la réalisation des vidéos.
- Les vidéos sont livrées sous forme numérique, dans un format adapté aux réseaux sociaux${i.deliveryDays ? `, dans les ${i.deliveryDays} jours suivant la réception du paiement` : ""}.
- Les vidéos qui n'ont pas pu être livrées au cours d'un mois pour une raison imputable au Client ne sont pas reportées au mois suivant, sauf accord écrit contraire des parties.

## Article 3 – Corrections
Chaque vidéo comprend ${rev}. Une demande de correction est introduite dans les 7 jours suivant la livraison, avec des remarques concrètes regroupées en un seul message. Une vidéo pour laquelle aucune correction n'est demandée dans ce délai est considérée comme approuvée. Toute correction supplémentaire ou modification après approbation n'est effectuée qu'après accord sur un supplément de prix.

## Article 4 – Rémunération et paiement
- La rémunération s'élève à ${eurFr(i.monthlyFee)} par mois, hors TVA, pour ${i.videosPerMonth} vidéos.
- La rémunération est payée à l'avance : Solyn Global facture mensuellement et le paiement est reçu avant le début du mois concerné. La production d'un mois commence après réception du paiement.
- TVA : Solyn Global est établie au Royaume-Uni ; la TVA est autoliquidée par le Client (régime d'autoliquidation), sauf disposition légale contraire.
- Les paiements sont effectués sur l'un des comptes de Solyn Global mentionnés sous « Coordonnées de Solyn Global », avec mention du numéro de facture.
- En cas de retard de paiement, Solyn Global peut suspendre la livraison jusqu'à réception du paiement.

## Article 5 – ${i.trialMonths ? "Période d'essai, prolongation et résiliation" : "Durée et résiliation"}
${i.trialMonths
  ? `Le présent contrat constitue une période d'essai ${ofMonths(i.trialMonths)} et prend effet ${start}. À l'issue de la période d'essai, la collaboration peut être prolongée ; les parties confirment la prolongation par écrit (y compris par e-mail). À défaut de prolongation, le contrat prend fin à l'issue de la période d'essai. Après prolongation, le contrat se poursuit de mois en mois aux mêmes conditions, et chaque partie peut le résilier par écrit moyennant un préavis ${ofMonths(notice)}. Les mois déjà payés sont intégralement exécutés ; les montants payés ne sont pas remboursés.`
  : `Le présent contrat prend effet ${start} et est conclu pour une durée indéterminée. Chaque partie peut le résilier par écrit (y compris par e-mail) moyennant un préavis ${ofMonths(notice)}. Les mois déjà payés sont intégralement exécutés ; les montants payés ne sont pas remboursés.`}

## Article 6 – Propriété et utilisation
Dès leur livraison, les vidéos appartiennent entièrement au Client : les droits patrimoniaux sur les vidéos livrées sont cédés au Client, qui peut les utiliser, les modifier et les diffuser sans limite de durée et de toute manière. Solyn Global conserve toutefois le droit d'utiliser gratuitement les vidéos pour sa propre publicité, son propre contenu et son propre matériel promotionnel, tels que son site web, ses réseaux sociaux et son portfolio. Les rushes et fichiers de travail restent la propriété de Solyn Global, sauf accord contraire.

## Article 7 – Responsabilité du contenu
Le Client garantit qu'il détient les droits sur le matériel qu'il fournit (logos, musique, photos) et qu'il a obtenu l'accord des personnes reconnaissables à l'image, y compris son personnel et ses clients. Le Client approuve le contenu avant publication et reste responsable de ce qu'il publie.

## Article 8 – Responsabilité
La responsabilité de Solyn Global est limitée à la rémunération payée par le Client au cours des trois mois précédant le fait générateur du dommage. Solyn Global n'est pas responsable des résultats des publications (tels que la portée, les abonnés ou le chiffre d'affaires) ni des modifications ou pannes des plateformes de réseaux sociaux.

## Article 9 – Confidentialité et données personnelles
Les parties traitent de manière confidentielle les informations confidentielles de l'autre partie. Les données personnelles ne sont traitées qu'aux fins de l'exécution du présent contrat et conformément au RGPD.

## Article 10 – Droit applicable
Le présent contrat est régi par le droit belge dans la mesure permise par la loi. Les litiges font d'abord l'objet d'une tentative de règlement amiable ; dans la mesure où cela a été valablement convenu, le tribunal de l'entreprise du ressort du siège social du Client est compétent.

## Article 11 – Modifications
Les modifications ou ajouts ne sont valables que s'ils sont confirmés par écrit (y compris par e-mail) par les deux parties.`;
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

export async function downloadAgreementPDF(a: { reference: string; title: string; body: string; clientName: string; representative?: string | null; place?: string; lang?: "nl" | "fr" }) {
  const fr = a.lang === "fr" || a.body.startsWith("Référence");
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
    if (b.text.startsWith("Referentie:") || b.text.startsWith("Référence :")) continue;
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
  doc.text(fr ? `Fait en deux exemplaires à ${a.place ?? "Tongeren"} le ……………………, chaque partie ayant reçu le sien.` : `Opgemaakt in twee exemplaren te ${a.place ?? "Tongeren"} op ……………………, waarvan elke partij er één ontvangt.`, L, y);
  y += 14;
  const col = (x: number, who: string, name: string) => {
    doc.setFont("helvetica", "bold"); doc.text(who, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(name, x, y + 6);
    doc.setDrawColor(180); doc.line(x, y + 26, x + 70, y + 26);
    doc.setFontSize(8); doc.setTextColor(120); doc.text(fr ? "Signature, précédée de la mention \"lu et approuvé\"" : "Handtekening, voorafgegaan door \"gelezen en goedgekeurd\"", x, y + 31);
    doc.setFontSize(10); doc.setTextColor(50);
  };
  col(L, fr ? "Pour Solyn Global" : "Voor Solyn Global", "Jason Balongo");
  col(L + 90, fr ? "Pour le Client" : "Voor de Opdrachtgever", a.representative ? `${a.representative} – ${a.clientName}` : a.clientName);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`${COMPANY.name} · ${a.reference} · ${fr ? "page" : "pagina"} ${i}/${pages}`, 105, 290, { align: "center" });
  }
  doc.save(`${a.reference} ${a.clientName}.pdf`.replace(/[\\/:*?"<>|]/g, ""));
}
