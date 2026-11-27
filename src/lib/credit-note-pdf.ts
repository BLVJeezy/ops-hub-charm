import { jsPDF } from "jspdf";
import logoAsset from "@/assets/solyn-logo.png.asset.json";
import { COMPANY } from "./constants";
import { formatDate } from "./format";
import { formatInvoiceNumber } from "./invoice-code";
import { formatEURCents } from "./credit-note";
import type { LineItem } from "./invoice-pdf";

export type CreditNotePDFInput = {
  credit_number: string;
  date: string;
  invoice_number: string | number;
  invoice_date: string;
  invoice_total: number;
  client_name: string;
  client_address?: string | null;
  client_vat_number?: string | null;
  amount: number;
  reason: string;
  line_items?: LineItem[];
  vat_note?: string | null;
};

const DARK = 30;
const MUTED = 120;

async function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(logoAsset.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const rawDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!rawDataUrl) return null;
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(rawDataUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size);
        ctx.restore();
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });
  } catch {
    return null;
  }
}

function originalDescription(items?: LineItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return "Geleverde diensten";
  const parts = items.map((i) => (i?.description || "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Geleverde diensten";
}

export function generateCreditNotePDF(cn: CreditNotePDFInput, logoDataUrl?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const L = 20;
  const R = W - 20;
  const invoiceCode = formatInvoiceNumber(cn.invoice_number);
  const creditDate = formatDate(cn.date);
  const invoiceDate = formatDate(cn.invoice_date);
  const absAmount = Math.abs(Number(cn.amount) || 0);
  const negAmount = formatEURCents(-absAmount);
  const posAmount = formatEURCents(absAmount);
  const isFullCredit = absAmount >= (Number(cn.invoice_total) || 0) - 0.004;
  let y = 24;

  // ===== Header =====
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", L, 13, 20, 20);
  }
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Solyn Global", logoDataUrl ? L + 26 : L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("Ops & Invoicing", logoDataUrl ? L + 26 : L, y + 6);

  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CREDITNOTA", R, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text(cn.credit_number, R, y + 7, { align: "right" });

  y += 18;

  // ===== Two columns: VAN / AAN =====
  const midX = L + 90;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("VAN (UITREIKER EN TERUGBETALER):", L, y);
  doc.text("AAN (KLANT):", midX, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(DARK);
  doc.text(COMPANY.name, L, y + 5.5);
  doc.text(cn.client_name || "—", midX, y + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  let ly = y + 10.5;
  const compAddr = doc.splitTextToSize(COMPANY.address, 84);
  doc.text(compAddr, L, ly);
  ly += compAddr.length * 4.5;
  doc.text(`Bedrijfsnummer (Companies House): ${COMPANY.companyNumber}`, L, ly);
  ly += 4.5;
  doc.text("jason@solynglobal.be · +32 485 59 45 55", L, ly);
  ly += 4.5;

  let ry = y + 10.5;
  if (cn.client_address) {
    const cAddr = doc.splitTextToSize(cn.client_address, R - midX);
    doc.text(cAddr, midX, ry);
    ry += cAddr.length * 4.5;
  }
  if (cn.client_vat_number) {
    doc.text(`Btw-nummer: ${cn.client_vat_number}`, midX, ry);
    ry += 4.5;
  }

  y = Math.max(ly, ry) + 6;

  // ===== Grey 4-column info bar =====
  doc.setFillColor(245, 245, 245);
  doc.rect(L, y, R - L, 14, "F");
  const colW = (R - L) / 4;
  const infoCols: Array<[string, string]> = [
    ["CREDITNOTANUMMER", cn.credit_number],
    ["UITGIFTEDATUM", creditDate],
    ["ORIGINELE FACTUUR", invoiceCode],
    ["FACTUURDATUM", invoiceDate],
  ];
  infoCols.forEach(([label, val], idx) => {
    const x = L + idx * colW + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(label, x, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(DARK);
    doc.text(val, x, y + 10.5);
  });
  y += 20;

  // ===== Reason =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("REDEN VAN CREDITERING:", L, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(DARK);
  const reasonLines = doc.splitTextToSize(cn.reason || "Volledige terugbetaling van de vooruitbetaling", R - L);
  doc.text(reasonLines, L, y);
  y += reasonLines.length * 4.8 + 6;

  // ===== Table header =====
  const xQty = L + 96;
  const xPrice = L + 118;
  const xVat = L + 142;
  doc.setFillColor(245, 245, 245);
  doc.rect(L, y, R - L, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("BESCHRIJVING", L + 3, y + 6);
  doc.text("AANTAL", xQty, y + 6, { align: "right" });
  doc.text("PRIJS", xPrice, y + 6, { align: "right" });
  doc.text("BTW", xVat, y + 6, { align: "right" });
  doc.text("TOTAAL", R - 3, y + 6, { align: "right" });
  y += 13;

  // ===== Table row =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(DARK);
  const lineDesc = `Creditering factuur ${invoiceCode}: ${originalDescription(cn.line_items)}`;
  const descLines = doc.splitTextToSize(lineDesc, 84);
  doc.text(descLines, L + 3, y);
  doc.text("1", xQty, y, { align: "right" });
  doc.text(negAmount, xPrice, y, { align: "right" });
  doc.text("0% verlegd", xVat, y, { align: "right" });
  doc.text(negAmount, R - 3, y, { align: "right" });
  y += descLines.length * 4.8 + 5;

  doc.setDrawColor(220);
  doc.line(L, y, R, y);
  y += 6;

  // ===== Subtotals & total bar =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text("Totaal excl. btw", L + 3, y);
  doc.setTextColor(DARK);
  doc.text(negAmount, R - 3, y, { align: "right" });
  y += 5.5;

  doc.setTextColor(MUTED);
  doc.text("Btw (verlegd naar de klant)", L + 3, y);
  doc.setTextColor(DARK);
  doc.text("€0,00", R - 3, y, { align: "right" });
  y += 8;

  doc.setFillColor(245, 245, 245);
  doc.rect(L, y - 4, R - L, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(DARK);
  doc.text("TOTAAL TE CREDITEREN EN TERUG TE BETALEN:", L + 3, y + 2.5);
  doc.text(negAmount, R - 3, y + 2.5, { align: "right" });
  y += 14;

  // ===== Refund block =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("TERUGBETALING:", L, y);
  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(DARK);
  doc.text(`Solyn Global LTD betaalt ${posAmount} terug aan ${cn.client_name || "de klant"}.`, L, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const refund1 = doc.splitTextToSize(
    `Het bedrag wordt overgeschreven naar de rekening waarvan factuur ${invoiceCode} betaald werd.`,
    R - L,
  );
  doc.text(refund1, L, y);
  y += refund1.length * 4.5 + 1;
  doc.text(`Mededeling bij de overschrijving: Creditnota ${cn.credit_number} / factuur ${invoiceCode}.`, L, y);
  y += 5;
  if (isFullCredit) {
    const settled = doc.splitTextToSize(
      `Met deze creditnota is factuur ${invoiceCode} volledig vereffend. Geen van beide partijen is nog iets verschuldigd.`,
      R - L,
    );
    doc.text(settled, L, y);
    y += settled.length * 4.5 + 2;
  }

  // ===== Signature block =====
  y = Math.max(y + 8, 224);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(DARK);
  doc.text("Voor Solyn Global LTD,", L, y);
  y += 12;
  doc.setDrawColor(180);
  doc.line(L, y, L + 55, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Jason Balongo – Director", L, y);
  y += 4.8;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED);
  doc.text(`Datum: ${creditDate}`, L, y);

  // ===== Legal footer =====
  const fy = Math.max(y + 10, 264);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.8);
  doc.setTextColor(MUTED);
  const legal = `Btw verlegd: de medecontractant is gehouden tot voldoening van de belasting overeenkomstig artikel 196 van Richtlijn 2006/112/EG. De klant corrigeert de oorspronkelijk verlegde btw in zijn btw-aangifte. Deze creditnota maakt deel uit van een afzonderlijke, doorlopende nummering en verwijst naar factuur ${invoiceCode} van ${invoiceDate}.`;
  const legalLines = doc.splitTextToSize(legal, R - L);
  doc.text(legalLines, L, fy);

  return doc;
}

export async function downloadCreditNotePDF(cn: CreditNotePDFInput) {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = generateCreditNotePDF(cn, logoDataUrl);
  doc.save(`Creditnota-${cn.credit_number}.pdf`);
}