import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { videoHead } from "@/lib/video-review";

export const Route = createFileRoute("/")({
  head: () => videoHead("Solyn Global · Ops Hub", "Solyn Global’s interne werkruimte voor klanten, facturen en videoproductie."),
  component: RootRedirect,
});

function RootRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate({ to: "/dashboard", replace: true });
    } else {
      navigate({ to: "/auth", replace: true });
    }
  }, [user, loading, navigate]);

  // Blank screen while deciding — no flash, no content
  return null;
}
