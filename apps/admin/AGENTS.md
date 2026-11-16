<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Genie Super Admin architecture
- Pages read/write data only through `src/services/admin` (collections in `src/lib/admin/store.ts`, localStorage-backed demo); swap internals for a real backend later without touching pages.
- Most modules are config objects in `src/lib/admin/modules.tsx` rendered by the generic `ResourcePage`; add new list modules there rather than building bespoke pages.
- Role checks use `src/lib/permissions/roles.ts` (`can`) — UI simulation only, must be mirrored server-side.
- Admin pages live under the pathless `_admin` layout, which gates on the client session and renders after hydration.
- tsconfig relaxes noUncheckedIndexedAccess / exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature because the config-driven tables use dynamic row keys.
