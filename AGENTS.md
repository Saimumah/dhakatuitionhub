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

# Architecture rules

- Tutor lead submissions are inserted server-side (service role) via `src/lib/tutor-request.functions.ts`; only active staff can read/update them through RLS (`is_active_staff`).
- Staff roles live in `public.user_roles` (owner/admin/moderator); DB triggers make the single owner immutable, so owner protection never relies on app code alone.
- Staff management writes go through `src/lib/admin.functions.ts`, which verifies the caller's role before any service-role call, and writes `audit_logs`.
- Owner notification is isolated in `src/lib/owner-notify.server.ts` and must never fail a submission; delivery state is stored on the application row for retry.
