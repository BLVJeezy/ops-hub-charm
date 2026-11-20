import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Nu controleren" on the Automations page: runs the hourly check right away. Staff only; no mail, just the verdicts. */
export const checkAutomationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff, error } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    if (!staff) throw new Error("Alleen voor het team");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runAutomationHealth } = await import("./automation-health.server");
    const r = await runAutomationHealth(supabaseAdmin, { mail: false });
    return { checked: r.checked, stale: r.stale };
  });
