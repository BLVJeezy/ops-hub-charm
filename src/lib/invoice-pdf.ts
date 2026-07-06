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

export function generateInvoicePDF(inv: InvoicePDFInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  let y = 20;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("FACTUUR", 20, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(COMPANY.name, W - 20, y - 4, { align: "right" });
  const addrLines = doc.splitTextToSize(COMPANY.address, 80);
  doc.text(addrLines, W - 20, y + 1, { align: "right" });
  doc.text(`Company no.: ${COMPANY.companyNumber}`, W - 20, y + 1 + addrLines.length * 4, { align: "right" });

  y += 30;
  doc.setDrawColor(200);
  doc.line(20, y, W - 20, y);
  y += 8;

  // Meta + Bill to
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Factuurnummer", 20, y);
  doc.text("Factuurdatum", 20, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(String(inv.invoice_number), 60, y);
  doc.text(formatDate(inv.date), 60, y + 6);

  doc.setFont("helvetica", "bold");
  doc.text("Aan:", W / 2, y);
  doc.setFont("helvetica", "normal");
  doc.text(inv.client_name, W / 2, y + 6);
  let by = y + 12;
  if (inv.client_address) {
    const lines = doc.splitTextToSize(inv.client_address, 80);
    doc.text(lines, W / 2, by);
    by += lines.length * 4;
  }
  if (inv.client_vat_number) {
    doc.text(`BTW: ${inv.client_vat_number}`, W / 2, by);
  }

  y += 26;

  // Table header
  doc.setFillColor(240);
  doc.rect(20, y, W - 40, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Omschrijving", 22, y + 5.5);
  doc.text("Aantal", 120, y + 5.5, { align: "right" });
  doc.text("Prijs", 150, y + 5.5, { align: "right" });
  doc.text("Totaal", W - 22, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const item of inv.line_items) {
    const lines = doc.splitTextToSize(item.description || "", 90);
    const lineTotal = item.qty * item.unit_price;
    doc.text(lines, 22, y + 4);
    doc.text(String(item.qty), 120, y + 4, { align: "right" });
    doc.text(formatCurrency(item.unit_price), 150, y + 4, { align: "right" });
    doc.text(formatCurrency(lineTotal), W - 22, y + 4, { align: "right" });
    y += Math.max(6, lines.length * 4 + 2);
    doc.setDrawColor(230);
    doc.line(20, y, W - 20, y);
    y += 2;
  }

  // Total
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Totaal", 120, y + 4);
  doc.text(formatCurrency(inv.total), W - 22, y + 4, { align: "right" });
  y += 12;

  // VAT note
  if (inv.vat_note) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(inv.vat_note, W - 40);
    doc.text(lines, 20, y);
    y += lines.length * 4 + 4;
  }

  // Payment details footer
  y = Math.max(y, 250);
  doc.setDrawColor(200);
  doc.line(20, y, W - 20, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Betaalgegevens", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text(`IBAN: ${COMPANY.iban}`, 20, y + 5);
  doc.text(`BIC: ${COMPANY.bic}`, 20, y + 10);
  doc.text(`Vermeld factuurnummer ${inv.invoice_number} bij betaling.`, 20, y + 15);

  return doc;
}

export function downloadInvoicePDF(inv: InvoicePDFInput) {
  const doc = generateInvoicePDF(inv);
  doc.save(`Factuur-${inv.invoice_number}.pdf`);
}
