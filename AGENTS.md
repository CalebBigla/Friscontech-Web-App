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

- Keep Phase 1 frontend-only with tenant-scoped mock records in `src/data`; this preserves realistic relationships while deferring persistence.
- Keep dashboard controls reusable through shared UI components; this prevents role dashboards from diverging as later phases are added.
- Mock data lives in `src/data/mock-db.ts` (relational, ID-linked, no derived values); all business math lives in `src/lib/calculations.ts`; so pages never duplicate numbers.
- Writes go through `src/services/services.ts` (async, API-shaped) over the store in `src/services/mock-store.ts`; so swapping to a real API touches one file.
- Demo RBAC scope comes from `src/lib/session.ts` (`getAccessScope`); so every page filters data by role the same way.
