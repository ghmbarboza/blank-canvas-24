import { describe, expect, it } from "vitest";

import {
  cleanInstance,
  cleanMeta,
  downServices,
  serviceStatuses,
  SERVICES,
  DOWN_AFTER_MS,
} from "./heartbeats";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("serviceStatuses", () => {
  it("serviço com sinal recente está no ar", () => {
    const [s] = serviceStatuses(
      [{ service: "app-cron", instance: "a", last_seen: ago(30_000) }],
      NOW,
    );
    expect(s).toMatchObject({ service: "app-cron", age_s: 30, down: false, instances: 1 });
  });

  it("passou de 3 minutos sem sinal está fora", () => {
    const st = serviceStatuses(
      [{ service: "app-cron", instance: "a", last_seen: ago(DOWN_AFTER_MS + 1000) }],
      NOW,
    );
    expect(downServices(st)).toEqual(["app-cron"]);
  });

  it("exatamente no limite ainda conta como no ar", () => {
    const st = serviceStatuses(
      [{ service: "x1", instance: "a", last_seen: ago(DOWN_AFTER_MS) }],
      NOW,
    );
    expect(st[0]!.down).toBe(false);
  });

  it("uma instância viva basta para o serviço estar no ar", () => {
    const st = serviceStatuses(
      [
        { service: "livecoach-worker", instance: "velha", last_seen: ago(60 * 60_000) },
        { service: "livecoach-worker", instance: "nova", last_seen: ago(10_000) },
      ],
      NOW,
    );
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ down: false, instances: 2, age_s: 10 });
  });

  it("ignora data inválida e ordena por nome", () => {
    const st = serviceStatuses(
      [
        { service: "b", instance: "a", last_seen: ago(1000) },
        { service: "a", instance: "a", last_seen: ago(1000) },
        { service: "c", instance: "a", last_seen: "não é data" },
      ],
      NOW,
    );
    expect(st.map((s) => s.service)).toEqual(["a", "b"]);
  });

  it("relógio adiantado do serviço não gera idade negativa", () => {
    const st = serviceStatuses([{ service: "a1", instance: "a", last_seen: ago(-5000) }], NOW);
    expect(st[0]!.age_s).toBe(0);
  });
});

describe("cleanInstance", () => {
  it("limpa caracteres estranhos e limita o tamanho", () => {
    expect(cleanInstance("pod-1 <script>")).toBe("pod-1script");
    expect(cleanInstance("x".repeat(300))).toHaveLength(120);
    expect(cleanInstance(undefined)).toBe("default");
    expect(cleanInstance("   ")).toBe("default");
  });
});

describe("cleanMeta", () => {
  it("guarda só valores simples e corta texto longo", () => {
    expect(
      cleanMeta({ pid: 12, ok: true, v: "1.2", nested: { a: 1 }, list: [1], big: "x".repeat(500) }),
    ).toEqual({ pid: 12, ok: true, v: "1.2", big: "x".repeat(200) });
    expect(cleanMeta(null)).toEqual({});
    expect(cleanMeta([1, 2])).toEqual({});
    expect(cleanMeta({ n: Number.NaN })).toEqual({});
  });
});

describe("serviço sob demanda", () => {
  const NOW2 = Date.parse("2026-10-26T12:00:00Z");
  const old = new Date(NOW2 - 60 * 60_000).toISOString();
  const rows = [{ service: SERVICES.LIVECOACH_WORKER, instance: "a", last_seen: old }];
  it("sem reunião ao vivo, o worker sem sinal está dormindo, não fora", () => {
    const [s] = serviceStatuses(rows, NOW2);
    expect(s?.down).toBe(false);
    expect(s?.sleeping).toBe(true);
  });
  it("com reunião ao vivo e sem sinal, está fora", () => {
    const [s] = serviceStatuses(rows, NOW2, undefined, new Set([SERVICES.LIVECOACH_WORKER]));
    expect(s?.down).toBe(true);
    expect(s?.sleeping).toBe(false);
  });
  it("serviço contínuo sem sinal continua fora", () => {
    const [s] = serviceStatuses(
      [{ service: SERVICES.APP_CRON, instance: "a", last_seen: old }],
      NOW2,
    );
    expect(s?.down).toBe(true);
  });
});

describe("serviços esperados sem primeiro sinal", () => {
  it("cron que nunca iniciou aparece como fora, sem idade inventada", () => {
    const st = serviceStatuses([], NOW, undefined, undefined, new Set([SERVICES.APP_CRON]));
    expect(st).toEqual([
      {
        service: SERVICES.APP_CRON,
        last_seen: null,
        age_s: null,
        instances: 0,
        down: true,
        sleeping: false,
      },
    ]);
  });
  it("worker nunca iniciado é exigido quando há reunião", () => {
    const expected = new Set([SERVICES.LIVECOACH_WORKER]);
    expect(serviceStatuses([], NOW, undefined, expected, expected)[0]?.down).toBe(true);
    expect(serviceStatuses([], NOW, undefined, new Set(), expected)[0]?.sleeping).toBe(true);
  });
});
