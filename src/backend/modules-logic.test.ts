import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isModuleOn, jobModule, moduleOffMessage } from "./modules-logic";

describe("recursos extras no servidor (S3)", () => {
  it("só vale o que está na lista settings.modules", () => {
    expect(isModuleOn({ modules: ["treino"] }, "treino")).toBe(true);
    expect(isModuleOn({ modules: ["treino"] }, "campanhas")).toBe(false);
    expect(isModuleOn({}, "treino")).toBe(false);
    expect(isModuleOn(null, "treino")).toBe(false);
    expect(isModuleOn({ modules: "treino" }, "treino")).toBe(false);
  });

  it("trabalhos da fila de um recurso extra são reconhecidos; os demais não", () => {
    expect(jobModule("automation.step")).toBe("automacoes");
    expect(jobModule("email.campaign")).toBe("campanhas");
    expect(jobModule("crm.sync")).toBe("gestao");
    expect(jobModule("ai.reply")).toBeNull();
    expect(jobModule("email.send")).toBeNull();
  });

  it("a mensagem diz o que está desligado e onde ligar", () => {
    expect(moduleOffMessage("Treino")).toContain('"Treino"');
    expect(moduleOffMessage("Treino")).toContain("Ajustes › Recursos extras");
  });

  // Guarda de regressão: cada rota de recurso extra confere o módulo no servidor.
  const routes: Array<[string, string]> = [
    ["src/routes/api/automations.ts", "automacoes"],
    ["src/routes/api/email.ts", "campanhas"],
    ["src/routes/api/coach/roleplay.ts", "treino"],
    ["src/routes/api/agents.ts", "pergunte"],
    ["src/routes/api/gestao.ts", "gestao"],
    ["src/routes/api/sac.ts", "incidentes"],
  ];
  it.each(routes)("%s exige o recurso %s", (file, id) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(src).toContain(`requireModule(caller, "${id}")`);
  });
});
