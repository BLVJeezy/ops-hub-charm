import { generateCreditNotePDF, type CreditNotePDFInput } from "./credit-note-pdf";

const LOGO_URL =
  "https://solyn22.lovable.app/__l5e/assets-v1/092540db-660e-4b68-a74f-63b871c46f1d/solyn-logo.png";

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export async function buildCreditNotePdfBase64(input: CreditNotePDFInput): Promise<string> {
  const logo = await fetchLogoDataUrl();
  const doc = generateCreditNotePDF(input, logo);
  const ab = doc.output("arraybuffer") as ArrayBuffer;
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}