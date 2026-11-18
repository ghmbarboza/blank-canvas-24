import { describe, expect, it } from "vitest";

import { validateGraph } from "@/features/automations/engine";
import { STAGE_COLORS } from "@/features/crm/stageColors";

import { SEGMENT_TEMPLATES, segmentTemplate } from "./segments";

describe("modelos por segmento", () => {
  it("tem os seis segmentos pedidos", () => {
    expect(SEGMENT_TEMPLATES.map((t) => t.key).sort()).toEqual([
      "clinica",
      "escola",
      "imobiliaria",
      "saas_b2b",
      "stand_automovel",
      "varejo",
    ]);
    expect(segmentTemplate("clinica")?.name).toBe("Clínica e consultório");
  });

  for (const t of SEGMENT_TEMPLATES) {
    describe(t.name, () => {
      it("funis com etapa de ganho e de perda, nomes únicos e cores válidas", () => {
        for (const p of t.model.pipelines) {
          expect(p.stages.some((s) => s.kind === "won")).toBe(true);
          expect(p.stages.some((s) => s.kind === "lost")).toBe(true);
          const names = p.stages.map((s) => s.name.toLowerCase());
          expect(new Set(names).size).toBe(names.length);
          for (const s of p.stages) {
            expect(STAGE_COLORS).toContain(s.color);
            expect(s.name.length).toBeLessThanOrEqual(60);
          }
        }
      });

      it("campos e macros respeitam as regras do banco", () => {
        for (const f of t.model.fields) expect(f.key).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
        for (const m of t.model.macros) {
          expect(m.shortcut).toMatch(/^[a-z0-9][a-z0-9_-]{0,30}$/);
          expect(m.title.length).toBeLessThanOrEqual(80);
        }
      });

      it("cadências válidas no motor de automação, com chave única por segmento", () => {
        for (const c of t.model.cadences) {
          expect(validateGraph(c.graph)).toEqual([]);
          expect(c.template_key.startsWith(`seg_${t.key}_`)).toBe(true);
        }
      });

      it("agentes com limites (feed-the-LLM) e formulário de qualidade com item eliminatório", () => {
        expect(t.model.agents.length).toBeGreaterThan(0);
        for (const a of t.model.agents) {
          expect(a.instructions).toContain("Nunca invente");
          expect(a.handoff.length).toBeGreaterThan(10);
        }
        expect(t.model.qa_form.criteria.some((c) => c.eliminatory)).toBe(true);
      });
    });
  }

  it("chaves de cadência não se repetem entre segmentos", () => {
    const keys = SEGMENT_TEMPLATES.flatMap((t) => t.model.cadences.map((c) => c.template_key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
