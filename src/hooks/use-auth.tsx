import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/permissions";

interface AuthState {
  user: User | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, role: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRole(u: User | null) {
      if (!u) { setRole(null); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
      if (!mounted) return;
      const roles = (data || []).map((r) => r.role as Role);
      if (roles.includes("admin")) setRole("admin");
      else if (roles.includes("ops")) setRole("ops");
      else if (roles.includes("sales")) setRole("sales");
      else setRole(null);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      // Defer role fetch to next tick to avoid deadlock inside callback
      setTimeout(() => loadRole(session?.user ?? null), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      loadRole(data.session?.user ?? null).finally(() => mounted && setLoading(false));
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null); setRole(null);
  }

  return <AuthContext.Provider value={{ user, role, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
