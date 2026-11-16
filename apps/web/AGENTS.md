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

- App shell (sidebar + header) lives in src/routes/__root.tsx; nav items are defined once in src/components/layout/nav.ts so sidebar, breadcrumb and search stay in sync.
- Frontend-only for now: dashboard uses static sample data in src/components/dashboard/data.ts, no backend.

- Shared WhatsApp UI lives in src/components/whatsapp/ (templates-data.ts, inbox-data.ts, TemplatePreview.tsx, TemplateFormDialog.tsx); Templates and Inbox pages both consume it so bubbles, statuses and sample data stay consistent. "Use template" hands off via /inbox?template=<id> search param.

- Genie demo records and configuration live in a shared browser-hydrated DemoProvider, persisted under a versioned localStorage key; preserve saved records during navigation and reseed only on reset or invalid storage.
- Feature modules live in src/components/genie and leaf routes supply their own metadata; keep mock business logic separate from UI and preserve the existing TanStack routing shell.
- Automation editing uses @xyflow/react for node movement, connections and selection; persist serializable nodes/edges in the shared demo store.
