import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Nu nakijken" on the Mails page: ask Resend right away instead of waiting for the 10-minute run. Staff only. */
export const syncEmailsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff, error } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    if (!staff) throw new Error("Alleen voor het team");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncEmailStatus } = await import("./client-email.server");
    return syncEmailStatus(supabaseAdmin, 100);
  });
