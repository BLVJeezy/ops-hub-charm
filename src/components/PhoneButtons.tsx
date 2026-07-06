import { Phone, MessageCircle } from "lucide-react";
import { normalizePhone } from "@/lib/format";

export function PhoneButtons({ phone }: { phone?: string | null }) {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  return (
    <div className="inline-flex items-center gap-1">
      <a href={`tel:${phone}`} className="p-1.5 rounded-md hover:bg-muted transition" title="Call">
        <Phone className="w-3.5 h-3.5" />
      </a>
      <a
        href={`https://wa.me/${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-md hover:bg-muted transition"
        style={{ color: "#22C55E" }}
        title="WhatsApp"
      >
        <MessageCircle className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
