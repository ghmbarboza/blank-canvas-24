import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RoteiroView } from "./progress";

const view = (done: string[]): RoteiroView => {
  const titles: Record<string, string> = {
    empresa: "Sua empresa",
    canal: "Conectar o WhatsApp",
    conhecimento: "Base de conhecimento",
    agente: "Seu atendente de IA",
    regras: "Regras de pós-venda",
    teste: "Teste no seu número",
  };
  const steps = Object.entries(titles).map(([id, title]) => ({
    id,
    title,
    summary: `Resumo de ${title}`,
    required: id === "empresa" || id === "canal",
    later: false,
    done: done.includes(id),
    skipped: false,
  }));
  return {
    steps: [
      ...steps,
      {
        id: "equipe",
        title: "Convidar a equipe",
        required: false,
        later: true,
        done: false,
        skipped: false,
      },
    ],
    current: steps.find((s) => !s.done)?.id ?? null,
    requiredPending: steps.filter((s) => s.required && !s.done).length,
    remaining: steps.filter((s) => !s.done).length,
    detail: {
      company: "Loja Vita",
      segment: "varejo",
      sells: "",
      tone: "",
      whatsapp: null,
      documents: 0,
      rulesOn: done.includes("regras") ? 2 : 0,
      received: false,
      replied: false,
    },
  };
};

let current = view(["empresa", "canal", "conhecimento", "agente"]);
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("./progress", async (orig) => ({
  ...(await orig<typeof import("./progress")>()),
  useRoteiro: () => ({ data: current, isError: false, refetch: vi.fn() }),
}));
// os passos com rede ficam de fora: aqui interessa a lista, o progresso e o próximo clique
vi.mock("./steps/CompanyStep", () => ({ CompanyStep: () => <p>form empresa</p> }));
vi.mock("./steps/WhatsAppStep", () => ({ WhatsAppStep: () => <p>form whatsapp</p> }));
vi.mock("./steps/KnowledgeStep", () => ({ KnowledgeStep: () => <p>form base</p> }));
vi.mock("./steps/AgentStep", () => ({ AgentStep: () => <p>form atendente</p> }));

import { SetupGuide } from "./SetupGuide";

function open(step: string | null = null) {
  const onStep = vi.fn();
  const onAskVi = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <SetupGuide
      accountId="a"
      open
      onOpenChange={onOpenChange}
      step={step}
      onStep={onStep}
      onAskVi={onAskVi}
    />,
  );
  return { onStep, onAskVi, onOpenChange };
}

describe("Primeiros passos", () => {
  it("mostra os seis passos, o progresso e deixa óbvio qual é o próximo", () => {
    current = view(["empresa", "canal", "conhecimento", "agente"]);
    open();
    const nav = screen.getByRole("navigation", { name: "Passos da configuração" });
    expect(within(nav).getAllByRole("button", { name: /Feito|Agora|Depois/ })).toHaveLength(6);
    expect(screen.getByText(/4 de 6 passos prontos/)).toBeInTheDocument();
    const next = within(nav).getByRole("button", { name: /Regras de pós-venda/ });
    expect(next).toHaveTextContent("Agora");
    expect(next).toHaveAttribute("aria-current", "step");
    // o painel já abre no próximo passo, com o botão que leva para a tela de pós-venda
    expect(screen.getByRole("heading", { name: "Regras de pós-venda" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Escolher as regras de pós-venda/ }),
    ).toBeInTheDocument();
  });

  it("o botão das regras fecha o passo a passo e leva para /pos-venda", () => {
    current = view(["empresa", "canal", "conhecimento", "agente"]);
    const { onOpenChange } = open();
    fireEvent.click(screen.getByRole("button", { name: /Escolher as regras de pós-venda/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith({ to: "/pos-venda" });
  });

  it("clicar num passo abre o formulário dele; a Vi fica a um clique", () => {
    current = view(["empresa"]);
    const { onStep, onAskVi } = open();
    expect(screen.getByText("form whatsapp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Base de conhecimento/ }));
    expect(onStep).toHaveBeenCalledWith("conhecimento");
    fireEvent.click(screen.getByRole("button", { name: /Perguntar para a Vi/ }));
    expect(onAskVi).toHaveBeenCalled();
  });

  it("passos de depois aparecem separados e não contam no progresso", () => {
    current = view(["empresa", "canal", "conhecimento", "agente", "regras", "teste"]);
    open();
    expect(screen.getByText("Depois, se quiser")).toBeInTheDocument();
    expect(screen.getByText("Convidar a equipe")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tudo pronto" })).toBeInTheDocument();
  });
});
