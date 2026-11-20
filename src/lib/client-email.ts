/** Mails to clients and their delivery: the status words, and how a Resend "last_event" maps onto them. */
export type MailStatus =
  "failed" | "sent" | "delayed" | "delivered" | "opened" | "clicked" | "bounced" | "complained";
export const MAIL_STATUS: Record<
  MailStatus,
  { label: string; tone: "ok" | "wait" | "bad" | "best" }
> = {
  failed: { label: "Niet verstuurd", tone: "bad" },
  sent: { label: "Verstuurd", tone: "wait" },
  delayed: { label: "Vertraagd", tone: "wait" },
  delivered: { label: "Afgeleverd", tone: "ok" },
  opened: { label: "Geopend", tone: "best" },
  clicked: { label: "Geklikt", tone: "best" },
  bounced: { label: "Teruggestuurd", tone: "bad" },
  complained: { label: "Als spam gemeld", tone: "bad" },
};
export const KIND_LABEL: Record<string, string> = {
  factuur: "Factuur",
  herinnering: "Betalingsherinnering",
  document: "Document",
  boeking: "Boekingsbevestiging",
  "afspraak-verplaatst": "Afspraak verplaatst",
  "afspraak-geannuleerd": "Afspraak geannuleerd",
  "aanvraag-gestart": "Aanvraag gestart",
  "aanvraag-klaar": "Aanvraag klaar",
};
/** Resend's last_event → our status. Unknown events keep the current one. */
export function fromResend(
  event: string | null | undefined,
  current: MailStatus = "sent",
): MailStatus {
  switch ((event ?? "").replace(/^email\./, "")) {
    case "delivered":
      return "delivered";
    case "opened":
      return "opened";
    case "clicked":
      return "clicked";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "delivery_delayed":
      return "delayed";
    case "failed":
    case "canceled":
      return "failed";
    case "sent":
    case "queued":
    case "scheduled":
      return current === "delayed" ? "delayed" : "sent";
    default:
      return current;
  }
}
/** Still worth asking Resend about: not final yet and sent in the last week. Opened mails can still be clicked, but that is not needed. */
export const pending = (s: MailStatus, sentAt: string, now = Date.now()) =>
  (s === "sent" || s === "delayed" || s === "delivered") && now - Date.parse(sentAt) < 7 * 864e5;
