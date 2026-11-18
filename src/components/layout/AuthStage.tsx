import { Wordmark } from "@/components/layout/Logo";
import { BRAND } from "@/lib/brand";

const PROOF = [
  {
    title: "Atendimento com IA",
    text: "responde no WhatsApp na hora e passa para a equipe quando precisa",
  },
  {
    title: "Pesquisa de satisfação",
    text: "pergunta depois de cada entrega e mostra quem está em risco",
  },
  {
    title: "Recompra",
    text: "avisa o momento certo de voltar a falar com cada cliente",
  },
];

// Palco do produto nas telas de acesso: painel azul-marinho, destaque dourado, título forte.
export function AuthStage() {
  return (
    <section className="relative hidden overflow-hidden bg-[var(--via-navy)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Atmosfera: navy profundo com uma luz dourada discreta no canto. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(680px 420px at 100% 0%, rgba(185,145,91,0.20), transparent 62%), linear-gradient(180deg, #001F35 0%, #001626 70%, #000D18 100%)",
        }}
        aria-hidden
      />
      <div className="relative">
        <Wordmark onDark />
      </div>
      <div className="relative max-w-xl">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--gold)] uppercase">
          {BRAND.tagline}
        </p>
        <p className="mt-5 font-display text-[3.25rem] leading-[1.04] font-extrabold text-balance">
          Quem já comprou <span className="text-[var(--gold)]">volta a comprar.</span>
        </p>
        <span className="mt-7 block h-[3px] w-16 rounded-full bg-[var(--gold)]" aria-hidden />
        <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-white/75">
          {BRAND.description}
        </p>
      </div>
      <ul className="relative grid gap-5 border-t border-white/15 pt-6 text-[14px] sm:grid-cols-3">
        {PROOF.map((p) => (
          <li key={p.title}>
            <p className="font-bold text-white">{p.title}</p>
            <p className="mt-1 leading-snug text-white/65">{p.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
