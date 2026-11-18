// Dimensionamento pela fórmula de Erlang C. Funções puras, sem dependência de tela nem de banco.
//
// Tráfego A (em erlangs) = chegadas no intervalo × tempo médio de atendimento ÷ duração do intervalo.
// Com N atendentes (N > A):
//   P(espera) = Erlang C(N, A), calculado pela recursão de Erlang B (estável para N grande):
//     B(0) = 1;  B(n) = A·B(n-1) / (n + A·B(n-1));  C = N·B / (N − A·(1 − B))
//   Nível de serviço  = 1 − C · e^(−(N − A) · T / TMA)       (T = meta de atendimento em segundos)
//   Espera média (ASA) = C · TMA / (N − A)

export interface ErlangInput {
  /** Chegadas no intervalo (ex.: ligações na hora). */
  arrivals: number;
  /** Tempo médio de atendimento, em segundos. */
  ahtSeconds: number;
  /** Duração do intervalo, em segundos (padrão 3600 = 1 hora). */
  intervalSeconds?: number;
  /** Meta de nível de serviço, de 0 a 1 (ex.: 0.8 = 80%). */
  serviceLevel: number;
  /** Tempo da meta, em segundos (ex.: 20 = "atender em até 20 s"). */
  answerSeconds: number;
  /** Atendimentos simultâneos por pessoa (chat). 1 para voz. */
  concurrency?: number;
  /** Perda por pausa, treino e ausência (0 a 0.7). */
  shrinkage?: number;
  /** Teto de segurança para o laço. */
  maxAgents?: number;
}

export interface ErlangResult {
  /** Atendentes ao mesmo tempo no posto, sem contar a perda. */
  agents: number;
  /** Pessoas escaladas, já com a perda (pausa, ausência). */
  scheduled: number;
  trafficErlangs: number;
  serviceLevel: number;
  probabilityWait: number;
  averageWaitSeconds: number;
  occupancy: number;
}

export function trafficIntensity(arrivals: number, ahtSeconds: number, intervalSeconds = 3600) {
  if (!(arrivals > 0) || !(ahtSeconds > 0) || !(intervalSeconds > 0)) return 0;
  return (arrivals * ahtSeconds) / intervalSeconds;
}

/** Probabilidade de o cliente esperar (Erlang C). 1 quando N ≤ A (fila cresce sem parar). */
export function erlangC(agents: number, traffic: number): number {
  if (traffic <= 0) return 0;
  if (agents <= traffic) return 1;
  let b = 1;
  for (let n = 1; n <= agents; n += 1) b = (traffic * b) / (n + traffic * b);
  return (agents * b) / (agents - traffic * (1 - b));
}

export function serviceLevelFor(
  agents: number,
  traffic: number,
  ahtSeconds: number,
  answerSeconds: number,
): number {
  if (traffic <= 0) return 1;
  if (agents <= traffic) return 0;
  const c = erlangC(agents, traffic);
  return 1 - c * Math.exp((-(agents - traffic) * answerSeconds) / ahtSeconds);
}

export function averageWait(agents: number, traffic: number, ahtSeconds: number): number {
  if (traffic <= 0) return 0;
  if (agents <= traffic) return Number.POSITIVE_INFINITY;
  return (erlangC(agents, traffic) * ahtSeconds) / (agents - traffic);
}

/** Menor número de atendentes que cumpre a meta de nível de serviço. */
export function requiredAgents(input: ErlangInput): ErlangResult {
  const concurrency = Math.max(1, Math.floor(input.concurrency ?? 1));
  const shrinkage = Math.min(0.7, Math.max(0, input.shrinkage ?? 0));
  const target = Math.min(0.999, Math.max(0.01, input.serviceLevel));
  const raw = trafficIntensity(input.arrivals, input.ahtSeconds, input.intervalSeconds ?? 3600);
  // No chat cada pessoa atende várias conversas: o tráfego por "posto" cai na mesma proporção.
  const traffic = raw / concurrency;
  if (traffic <= 0) {
    return {
      agents: 0,
      scheduled: 0,
      trafficErlangs: 0,
      serviceLevel: 1,
      probabilityWait: 0,
      averageWaitSeconds: 0,
      occupancy: 0,
    };
  }
  const max = input.maxAgents ?? 2000;
  let n = Math.max(1, Math.floor(traffic) + 1);
  while (n < max && serviceLevelFor(n, traffic, input.ahtSeconds, input.answerSeconds) < target)
    n += 1;
  return {
    agents: n,
    scheduled: Math.ceil(n / (1 - shrinkage)),
    trafficErlangs: round(raw, 3),
    serviceLevel: serviceLevelFor(n, traffic, input.ahtSeconds, input.answerSeconds),
    probabilityWait: erlangC(n, traffic),
    averageWaitSeconds: averageWait(n, traffic, input.ahtSeconds),
    occupancy: traffic / n,
  };
}

/**
 * Canal que não é em tempo real (e-mail, chamado): não tem fila de espera de segundos. Conta horas de
 * trabalho e divide por uma ocupação saudável (85%).
 */
export function backlogAgents(
  arrivals: number,
  ahtSeconds: number,
  intervalSeconds = 3600,
  occupancy = 0.85,
  shrinkage = 0,
): { agents: number; scheduled: number } {
  const work = trafficIntensity(arrivals, ahtSeconds, intervalSeconds);
  if (work <= 0) return { agents: 0, scheduled: 0 };
  const agents = Math.ceil(work / Math.min(1, Math.max(0.3, occupancy)));
  return { agents, scheduled: Math.ceil(agents / (1 - Math.min(0.7, Math.max(0, shrinkage)))) };
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
