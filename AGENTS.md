<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep video capability links on public SSR routes using token-validated server functions; browser queries never access private video rows directly.
- Use service-role-only atomic video feedback/upload RPCs with project row locks; this prevents double revision consumption and preserves the monthly tracker on approval.
- Keep video storage private and issue scoped signed upload reservations and one-hour download URLs; use TUS above 6 MiB for large phone uploads.
- Store video notification failures with feedback and show them in the staff drawer; a mail failure must not roll back a saved decision.
