import type { AuthProviders } from "@/lib/auth-setup";

/** Aviso da tela de entrada quando a cópia nasceu sem nenhum jeito de entrar ligado. */
export function AuthSetupNotice({ providers }: { providers: AuthProviders }) {
  if (providers.email || providers.google) return null;
  return (
    <section
      role="alert"
      aria-labelledby="auth-setup-title"
      className="mt-8 rounded-xl border border-gold/40 bg-gold/10 p-4 text-[13px] leading-relaxed"
    >
      <h2 id="auth-setup-title" className="font-display text-base font-bold">
        Falta ligar o login desta cópia
      </h2>
      <p className="mt-1 text-muted-foreground">
        Toda cópia nova nasce com o login desligado. Leva um minuto, uma vez só, no editor do
        Lovable:
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>
          No topo do editor, abra <strong>More</strong> e depois <strong>Users</strong>.
        </li>
        <li>
          Clique em <strong>Auth settings</strong>.
        </li>
        <li>
          Abra <strong>Google</strong>, ligue a chave, deixe em <strong>Managed by Lovable</strong> e
          salve.
        </li>
        <li>
          Abra <strong>Email</strong>, ligue a chave e salve.
        </li>
        <li>Volte aqui e atualize a página. A primeira conta vira a dona.</li>
      </ol>
      <p className="mt-3 text-muted-foreground">
        Se o Lovable perguntar algo no chat depois de salvar, não precisa responder: o botão do
        Google já existe.
      </p>
    </section>
  );
}
