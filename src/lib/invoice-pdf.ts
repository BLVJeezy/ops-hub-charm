import jsPDF from "jspdf";
import { COMPANY } from "./constants";
import { formatCurrency, formatDate } from "./format";

export type LineItem = { description: string; qty: number; unit_price: number };

export type InvoicePDFInput = {
  invoice_number: number;
  date: string;
  client_name: string;
  client_address?: string | null;
  client_vat_number?: string | null;
  line_items: LineItem[];
  vat_note?: string | null;
  total: number;
};

const DARK = 30;
const MUTED = 120;

export function generateInvoicePDF(inv: InvoicePDFInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const L = 20;
  const R = W - 20;
  let y = 25;

  // ===== Header =====
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Solyn Global", L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("Ops & Invoicing", L, y + 6);

  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("FACTUUR", R, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text(`#${inv.invoice_number}`, R, y + 7, { align: "right" });

  y += 20;

  // ===== Bill to / meta =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("GEFACTUREERD AAN:", L, y);
  doc.text("DATUM:", R, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(DARK);
  doc.text(inv.client_name, L, y + 6);
  doc.text(formatDate(inv.date), R, y + 6, { align: "right" });

  let by = y + 12;
  if (inv.client_address) {
    const lines = doc.splitTextToSize(inv.client_address, 100);
    doc.text(lines, L, by);
    by += lines.length * 5;
  }

  if (inv.client_vat_number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text("BEDRIJFSNUMMER:", R, y + 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(DARK);
    doc.text(inv.client_vat_number, R, y + 20, { align: "right" });
  }

  y = Math.max(by, y + 26) + 10;

  // ===== Table header =====
  doc.setFillColor(245, 245, 245);
  doc.rect(L, y, R - L, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("BESCHRIJVING", L + 3, y + 6);
  doc.text("PRIJS", R - 3, y + 6, { align: "right" });
  y += 13;

  // ===== Line items =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(DARK);
  for (const item of inv.line_items) {
    const desc = item.qty > 1 ? `${item.description} (x${item.qty})` : item.description;
    const lines = doc.splitTextToSize(desc || "", 130);
    const lineTotal = item.qty * item.unit_price;
    doc.text(lines, L + 3, y);
    doc.text(formatCurrency(lineTotal), R - 3, y, { align: "right" });
    y += lines.length * 5 + 2;
  }

  if (inv.vat_note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(inv.vat_note, L + 3, y);
    y += 5;
  }

  y += 6;
  doc.setDrawColor(220);
  doc.line(L, y, R, y);
  y += 8;

  // ===== Total =====
  doc.setFillColor(245, 245, 245);
  doc.rect(L, y - 4, R - L, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(DARK);
  doc.text("TOTAAL:", L + 3, y + 3);
  doc.text(formatCurrency(inv.total), R - 3, y + 3, { align: "right" });

  // ===== Footer: pay to =====
  let fy = 240;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("BETAAL AAN:", L, fy);
  fy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(DARK);
  doc.text(`Bedrijfsnaam: ${COMPANY.name}`, L, fy); fy += 5;
  const addrLines = doc.splitTextToSize(COMPANY.address, R - L);
  doc.text(addrLines, L, fy); fy += addrLines.length * 5;
  doc.text(`Bedrijfsnummer: ${COMPANY.companyNumber}`, L, fy); fy += 5;
  doc.text(`Rekeningnummer: ${COMPANY.iban}`, L, fy); fy += 5;
  doc.text(`BIC: ${COMPANY.bic}`, L, fy); fy += 8;

  if (inv.vat_note) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    const legal = "Btw verlegd: De medecontractant is gehouden tot voldoening van de belasting overeenkomstig artikel 196 van Richtlijn 2006/112/EG.";
    const legalLines = doc.splitTextToSize(legal, R - L);
    doc.text(legalLines, L, fy);
  }

  return doc;
}

export function downloadInvoicePDF(inv: InvoicePDFInput) {
  const doc = generateInvoicePDF(inv);
  doc.save(`Factuur-${inv.invoice_number}.pdf`);
}
