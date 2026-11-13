import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Run checks now" from the Status page. Admins only. */
export const runChecksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { siteId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Only admins can run checks");

    const { runMonitoring } = await import("./monitoring/run.server");
    return runMonitoring({ siteId: data.siteId, force: true });
  });
