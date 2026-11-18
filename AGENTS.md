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

## Authentication
- Reuse the existing AuthProvider and /entrar flow; keep one session subscriber and clear protected query caches before sign-out to prevent cross-session data leaks.
- Store user-facing identity in public.profiles, auto-created by an auth lifecycle trigger; preserve membership-based permissions separately from editable profile metadata.
- The first user of the database becomes the OWNER automatically: trigger `nexus_first_user_owner` on auth.users calls `create_account_for` (account "Minha empresa", default pipeline, owner membership, owner in queue_agents) when no account exists. Everyone after that joins only by invite (`bootstrap_account` refuses a second account unless `platform_settings.multi_account` is true, which is set only in the development original). `create_account_for` is locked in its body (the remix does not copy REVOKE/GRANT). The profile trigger (`nexus_create_auth_profile`) is versioned in migration `20261102080000_perfil_ao_cadastrar.sql`; the first-owner and invite flows also upsert the profile for remixes.
- Onboarding is ONE conversation: the Nexa roteiro (`src/backend/setup-agent/roteiro.ts`, done() read from real tables) is the only source of what is missing. The old step wizard was retired; do not add a second setup flow.
- Use the managed Lovable OAuth broker for Google and Lovable, returning to the public sign-in page before internal navigation.
- Keep credential validation and redirect sanitization in the browser-safe authentication module, tested independently of network services.
