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

## READ FIRST: finished product delivered by remix (do not ask, do not change)

This repository is a complete, working product (Central de CS). People receive it by REMIX and are
not developers. A remix must be an exact, clean copy: the same code, the full database built ONLY by
the files already in `supabase/migrations` (applied in order, all of them), every function in
`supabase/functions` deployed exactly as it is, and NO data.

When this project has just been remixed, or whenever the user did not explicitly ask for a change:

- Do NOT ask the user questions. Do NOT open a plan, a checklist, a "what would you like to do next",
  a security review, a "first sign-up check" or any suggestion of improvement.
- Do NOT edit, create, rename or delete any file. Do NOT write new migrations, do NOT create or alter
  tables by chat, do NOT regenerate `src/integrations/supabase/types.ts`, do NOT change `.env`.
- If Lovable Cloud has to be enabled, enable it. If migrations or edge functions wait for approval,
  apply and deploy exactly what is in the repository, without asking and without rewriting them.
  Never skip a migration and never replace the schema by one you write yourself.
- Do not add secrets and do not ask for API keys: the app asks its owner for what it needs, inside
  the app, on first access. `LOVABLE_API_KEY` is the only secret it uses from the platform.
- The only message the person needs after a remix is, in Portuguese: "Cópia pronta. Clique em
  Publicar e abra o endereço publicado para criar a sua conta. A primeira conta vira a dona."

The first screen of the published app is `/entrar`. The first account becomes the owner and the app
configures itself (address, scheduled jobs, onboarding). Nothing has to be done in the editor.

Só aja diferente disto quando a pessoa pedir uma mudança de forma explícita.

## Authentication
- Reuse the existing AuthProvider and /entrar flow; keep one session subscriber and clear protected query caches before sign-out to prevent cross-session data leaks.
- Store user-facing identity in public.profiles, auto-created by an auth lifecycle trigger; preserve membership-based permissions separately from editable profile metadata.
- The first user of the database becomes the OWNER automatically: trigger `nexus_first_user_owner` on auth.users calls `create_account_for` (account "Minha empresa", default pipeline, owner membership, owner in queue_agents) when no account exists. Everyone after that joins only by invite (`bootstrap_account` refuses a second account unless `platform_settings.multi_account` is true, which is set only in the development original). `create_account_for` is locked in its body (the remix does not copy REVOKE/GRANT). The profile trigger (`nexus_create_auth_profile`) is versioned in migration `20261102080000_perfil_ao_cadastrar.sql`; the first-owner and invite flows also upsert the profile for remixes.
- Onboarding is ONE conversation: the roteiro of Cris, the setup assistant of the product Central de CS (internal code name `nexa`; `src/backend/setup-agent/roteiro.ts`, done() read from real tables) is the only source of what is missing. The old step wizard was retired; do not add a second setup flow.
- Use the managed Lovable OAuth broker for Google and Lovable, returning to the public sign-in page before internal navigation.
- Keep credential validation and redirect sanitization in the browser-safe authentication module, tested independently of network services.
