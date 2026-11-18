import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";

const SHOWCASE = ["whatsapp", "instagram", "facebook", "tiktok", "telegram", "x"];

// Palco do produto nas telas de acesso (AuthShell do DS): entrar, criar senha nova.
export function AuthStage() {
  return (
    <section className="relative hidden overflow-hidden bg-[var(--via-navy)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Atmosfera navy do DS: gradiente profundo + luz radial no canto. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(720px 420px at 0% 0%, rgba(42,74,110,0.55), transparent 65%), linear-gradient(180deg, #0A1F3B 0%, #02162A 70%, #010B1A 100%)",
        }}
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <img
          src="/brand/via-monogram-white.png"
          alt="Viver de IA"
          width={434}
          height={239}
          className="w-12"
        />
        <span className="h-6 w-px bg-white/25" aria-hidden />
        <span className="text-[15px] font-semibold tracking-tight">Nexus One</span>
      </div>
      <div className="relative max-w-lg">
        <p className="text-[11px] font-medium tracking-[0.18em] text-white/60 uppercase">
          Atendimento e vendas · Viver de IA
        </p>
        <p className="mt-4 font-display text-5xl leading-[1.04] font-medium text-balance">
          Todas as conversas num só lugar.{" "}
          <span className="text-white/55">A IA diz quem está pronto para comprar.</span>
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {SHOWCASE.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
            >
              <span className="grid size-4 place-items-center rounded-full bg-white">
                <ChannelIcon platform={p} size={11} className="text-[var(--via-navy)]" />
              </span>
              {PLATFORM_LABEL[p] ?? p}
            </span>
          ))}
        </div>
      </div>
      <ul className="relative grid gap-4 border-t border-white/15 pt-6 text-[14px] sm:grid-cols-3">
        <li>
          <p className="font-medium">Uma caixa só</p>
          <p className="text-white/60">WhatsApp, Instagram e o chat do site no mesmo lugar</p>
        </li>
        <li>
          <p className="font-medium">Origem de cada lead</p>
          <p className="text-white/60">qual anúncio ou campanha trouxe cada conversa</p>
        </li>
        <li>
          <p className="font-medium">IA que avisa</p>
          <p className="text-white/60">quem está pronto para comprar e o próximo passo</p>
        </li>
      </ul>
    </section>
  );
}
