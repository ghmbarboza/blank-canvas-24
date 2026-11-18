import { AfterClass, AulaFooter, Cautions } from "./AulaClosing";
import { AulaHero } from "./AulaHero";
import { PrepChecklist } from "./PrepChecklist";
import { ProgressBar } from "./ProgressBar";
import { StepItem } from "./StepItem";
import { PREP_IDS, STEP_IDS, STEPS } from "./steps";
import { AULA_VARS, MANROPE_HREF } from "./theme";
import { useChecklist } from "./useChecklist";

const PREP_STORAGE_KEY = "aula:preparo:v1";
const STEPS_STORAGE_KEY = "aula:passos:v1";

// Página pública da aula (/aula): é para onde o QR Code do slide aponta.
export function AulaPage() {
  const prep = useChecklist(PREP_STORAGE_KEY, PREP_IDS);
  const steps = useChecklist(STEPS_STORAGE_KEY, STEP_IDS);

  const firstPending = STEPS.findIndex((step) => !steps.isChecked(step.id));
  const currentIndex = firstPending === -1 ? null : firstPending;
  const allDone = currentIndex === null;

  return (
    <div
      style={AULA_VARS}
      className="min-h-screen bg-[var(--aula-paper)] text-[var(--aula-ink)] antialiased"
    >
      {/* React 19 leva a folha de estilo para o <head>; sem a fonte, cai na fonte do app. */}
      <link rel="stylesheet" href={MANROPE_HREF} precedence="default" />

      <AulaHero />

      <main>
        <ProgressBar doneCount={steps.checked.length} currentIndex={currentIndex} />

        <PrepChecklist checklist={prep} />

        <section
          id="passos"
          aria-labelledby="aula-passos"
          className="scroll-mt-12 border-t border-[var(--aula-line)] bg-white"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--aula-gold-ink)]">
              Durante a aula
            </p>
            <h2
              id="aula-passos"
              className="mt-3 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl"
            >
              Os sete passos, na ordem
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--aula-muted)]">
              Faça um de cada vez, junto com o professor. Só marque como feito quando vir na tela o
              que está em “Deu certo quando”.
            </p>

            <ol className="mt-14 sm:mt-20">
              {STEPS.map((step, index) => (
                <StepItem
                  key={step.id}
                  step={step}
                  index={index}
                  total={STEPS.length}
                  done={steps.isChecked(step.id)}
                  current={index === currentIndex}
                  last={index === STEPS.length - 1}
                  onToggle={() => steps.toggle(step.id)}
                />
              ))}
            </ol>

            <div
              aria-live="polite"
              className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--aula-line)] pt-6"
            >
              <p className="text-lg font-extrabold">
                {allDone
                  ? "Pronto. O seu pós-venda no WhatsApp está funcionando."
                  : `${steps.checked.length} de ${STEPS.length} passos feitos.`}
              </p>
              {steps.checked.length > 0 ? (
                <button
                  type="button"
                  onClick={steps.reset}
                  className="rounded-sm text-sm font-bold text-[var(--aula-muted)] underline underline-offset-4 hover:text-[var(--aula-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aula-navy)]"
                >
                  Desmarcar todos os passos
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <Cautions />
        <AfterClass />
      </main>

      <AulaFooter />
    </div>
  );
}
