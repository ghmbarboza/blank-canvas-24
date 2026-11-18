// Alma do Nexus: o que a Nexa aprendeu, organizado em capítulos e versionado, para o
// construtor da alma (que vai montar persona, prompt e regras dos agentes) consumir depois.
// Puro: os capítulos dão o progresso do modal e o mesmo formato vai para a exportação.
import type { Fact, SetupSnapshot } from "./spec";

export const SOUL_VERSION = 1;

export const CHAPTERS = [
  { id: "identidade", label: "Identidade", categories: ["empresa"] },
  { id: "clientes", label: "Clientes", categories: ["clientes"] },
  { id: "oferta", label: "Oferta", categories: ["produtos", "vendas"] },
  { id: "voz", label: "Voz", categories: ["voz", "atendimento"] },
  { id: "canais", label: "Canais", categories: ["canais"] },
  { id: "equipe", label: "Equipe", categories: ["equipe", "regras"] },
] as const;
export type ChapterId = (typeof CHAPTERS)[number]["id"];

export interface ChapterState {
  id: ChapterId;
  label: string;
  done: boolean;
  facts: number;
}

// o capítulo também conta como feito pelo que já está configurado, não só pelo que foi dito
function configured(id: ChapterId, s: SetupSnapshot | null): boolean {
  if (!s) return false;
  if (id === "identidade") return Boolean(s.segment);
  if (id === "canais") return s.channels.length > 0;
  if (id === "equipe") return s.agents.length > 0 && s.team > 1;
  return false;
}

export function chapters(facts: Pick<Fact, "category">[], s: SetupSnapshot | null): ChapterState[] {
  return CHAPTERS.map((c) => {
    const n = facts.filter((f) => (c.categories as readonly string[]).includes(f.category)).length;
    return { id: c.id, label: c.label, facts: n, done: n > 0 || configured(c.id, s) };
  });
}

/** O capítulo atual é o primeiro que falta; com tudo feito, o último. */
export function currentChapter(list: ChapterState[]): ChapterState | null {
  return list.find((c) => !c.done) ?? list.at(-1) ?? null;
}

export interface SoulDocument {
  name: string;
  source: string;
  chunks: number;
}
export interface SoulWish {
  title: string;
  description: string;
  importance: string;
  status: string;
}

export interface Soul {
  version: number;
  generated_at: string;
  company: { name: string; segment: string | null };
  progress: { done: number; total: number };
  chapters: Record<
    ChapterId,
    { label: string; facts: Record<string, { label: string; value: string }> }
  >;
  others: Record<string, { label: string; value: string }>;
  setup: Pick<SetupSnapshot, "ai" | "channels" | "agents" | "team" | "modules"> & {
    integrations: string[];
  };
  knowledge: SoulDocument[];
  dreams: SoulWish[];
}

export function compileSoul(p: {
  snapshot: SetupSnapshot;
  facts: Fact[];
  documents: SoulDocument[];
  wishes: SoulWish[];
  now?: Date;
}): Soul {
  const states = chapters(p.facts, p.snapshot);
  const byChapter = Object.fromEntries(
    CHAPTERS.map((c) => [
      c.id,
      {
        label: c.label,
        facts: Object.fromEntries(
          p.facts
            .filter((f) => (c.categories as readonly string[]).includes(f.category))
            .map((f) => [f.key, { label: f.label, value: f.value }]),
        ),
      },
    ]),
  ) as Soul["chapters"];
  const known = new Set<string>(CHAPTERS.flatMap((c) => [...c.categories]));
  return {
    version: SOUL_VERSION,
    generated_at: (p.now ?? new Date()).toISOString(),
    company: { name: p.snapshot.company, segment: p.snapshot.segment },
    progress: { done: states.filter((c) => c.done).length, total: states.length },
    chapters: byChapter,
    others: Object.fromEntries(
      p.facts
        .filter((f) => !known.has(f.category))
        .map((f) => [f.key, { label: f.label, value: f.value }]),
    ),
    setup: {
      ai: p.snapshot.ai,
      channels: p.snapshot.channels,
      agents: p.snapshot.agents,
      team: p.snapshot.team,
      modules: p.snapshot.modules,
      // só o nome da integração conectada; segredo nunca entra na alma
      integrations: p.snapshot.integrations
        .filter((i) => i.status === "connected")
        .map((i) => i.id),
    },
    knowledge: p.documents,
    dreams: p.wishes,
  };
}
