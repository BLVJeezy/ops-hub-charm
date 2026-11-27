import React from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
  Section,
  Row,
  Column,
  Img,
} from "@react-email/components";

export interface CreditNoteEmailProps {
  clientName: string;
  creditNumber: string;
  invoiceCode: string;
  date: string;
  amountNegative: string;
  amountPositive: string;
  reason: string;
  isFullCredit: boolean;
  logoUrl?: string;
}

const DEFAULT_LOGO =
  "https://solyn22.lovable.app/__l5e/assets-v1/092540db-660e-4b68-a74f-63b871c46f1d/solyn-logo.png";

export const CreditNoteEmail = ({
  clientName,
  creditNumber,
  invoiceCode,
  date,
  amountNegative,
  amountPositive,
  reason,
  isFullCredit,
  logoUrl = DEFAULT_LOGO,
}: CreditNoteEmailProps) => {
  const preview = `Creditnota ${creditNumber} — factuur ${invoiceCode} (${amountNegative})`;

  return (
    <Html lang="nl" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            <Row>
              <Column style={{ width: "60%", verticalAlign: "middle" }}>
                <table cellPadding={0} cellSpacing={0} border={0}>
                  <tbody>
                    <tr>
                      <td style={{ verticalAlign: "middle", paddingRight: "12px" }}>
                        <Img src={logoUrl} width="56" height="56" alt="Solyn Global" style={logo} />
                      </td>
                      <td style={{ verticalAlign: "middle" }}>
                        <Text style={brandName}>Solyn Global</Text>
                        <Text style={brandSub}>Ops &amp; Invoicing</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Column>
              <Column style={{ width: "40%", textAlign: "right", verticalAlign: "top" }}>
                <Text style={docTitle}>CREDITNOTA</Text>
                <Text style={docNumber}>{creditNumber}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ marginTop: "28px" }}>
            <Text style={bodyText}>Beste {clientName},</Text>
            <Text style={bodyText}>
              In bijlage vindt u creditnota <strong>{creditNumber}</strong> met betrekking tot
              factuur <strong>{invoiceCode}</strong>.
            </Text>
          </Section>

          <Section style={summaryBox}>
            <Row style={summaryRow}>
              <Column style={summaryLabel}>CREDITNOTANUMMER</Column>
              <Column style={summaryVal}>{creditNumber}</Column>
            </Row>
            <Row style={summaryRow}>
              <Column style={summaryLabel}>ORIGINELE FACTUUR</Column>
              <Column style={summaryVal}>{invoiceCode}</Column>
            </Row>
            <Row style={summaryRow}>
              <Column style={summaryLabel}>UITGIFTEDATUM</Column>
              <Column style={summaryVal}>{date}</Column>
            </Row>
            <Row style={summaryRow}>
              <Column style={summaryLabel}>REDEN</Column>
              <Column style={summaryVal}>{reason}</Column>
            </Row>
            <Row style={totalRow}>
              <Column style={totalLabel}>TE CREDITEREN BEDRAG</Column>
              <Column style={totalVal}>{amountNegative}</Column>
            </Row>
          </Section>

          <Section style={{ marginTop: "24px" }}>
            <Text style={{ ...bodyText, fontWeight: 700 }}>
              Solyn Global LTD betaalt {amountPositive} terug aan {clientName}.
            </Text>
            <Text style={bodyText}>
              Het bedrag wordt overgeschreven naar de rekening waarvan factuur {invoiceCode} betaald
              werd, met mededeling: Creditnota {creditNumber} / factuur {invoiceCode}.
            </Text>
            {isFullCredit && (
              <Text style={bodyText}>
                Met deze creditnota is factuur {invoiceCode} volledig vereffend. Geen van beide
                partijen is nog iets verschuldigd.
              </Text>
            )}
          </Section>

          <Section style={{ marginTop: "32px" }}>
            <Text style={btwNote}>
              <em>
                Btw verlegd: de medecontractant is gehouden tot voldoening van de belasting
                overeenkomstig artikel 196 van Richtlijn 2006/112/EG.
              </em>
            </Text>
            <Text style={footerSign}>
              Solyn Global LTD · jason@solynglobal.be · +32 485 59 45 55
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export function creditNoteEmailSubject(creditNumber: string, invoiceCode: string): string {
  return `Creditnota ${creditNumber} — factuur ${invoiceCode} — Solyn Global`;
}

const main = { backgroundColor: "#ffffff", fontFamily: "Helvetica, Arial, sans-serif", color: "#111" };
const container = { padding: "40px 32px", maxWidth: "640px", margin: "0 auto" };
const logo = { borderRadius: "50%", display: "block" };
const brandName = { margin: 0, fontSize: "18px", fontWeight: 700, color: "#111" };
const brandSub = { margin: 0, fontSize: "13px", color: "#8a8a8a" };
const docTitle = { margin: 0, fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", color: "#111" };
const docNumber = { margin: "2px 0 0", fontSize: "12px", color: "#8a8a8a" };
const bodyText = { margin: "0 0 12px", fontSize: "14px", lineHeight: "22px", color: "#111" };
const summaryBox = { marginTop: "20px", backgroundColor: "#f7f7f7", borderRadius: "6px", padding: "12px 16px" };
const summaryRow = { padding: "4px 0" };
const summaryLabel = { fontSize: "11px", fontWeight: 700, color: "#8a8a8a", width: "45%" };
const summaryVal = { fontSize: "13px", color: "#111", textAlign: "right" as const, width: "55%" };
const totalRow = { borderTop: "1px solid #e5e5e5", paddingTop: "10px", marginTop: "6px" };
const totalLabel = { fontSize: "13px", fontWeight: 700, color: "#111", width: "55%" };
const totalVal = { fontSize: "15px", fontWeight: 700, color: "#111", textAlign: "right" as const, width: "45%" };
const btwNote = { margin: "0 0 8px", fontSize: "11px", color: "#8a8a8a", lineHeight: "16px" };
const footerSign = { margin: 0, fontSize: "12px", color: "#8a8a8a" };