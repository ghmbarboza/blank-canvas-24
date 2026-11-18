import type { AttentionItem } from "./attention";
import { format, subDays } from "date-fns";

import type { Gerencial, Period } from "./gerencial";

// Exemplo do painel para conta ainda sem movimento. É sempre rotulado na tela como exemplo e nunca
// é gravado no banco. Determinístico (mesma semente, mesmos números) para a tela não "piscar".

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// Demanda típica de atendimento comercial: pico às 10 h e às 15 h, vale no almoço, fim de semana fraco.
function hourWeight(hour: number): number {
  const morning = Math.exp(-((hour - 10) ** 2) / 6);
  const afternoon = Math.exp(-((hour - 15) ** 2) / 7) * 0.9;
  const evening = Math.exp(-((hour - 20) ** 2) / 5) * 0.35;
  return morning + afternoon + evening;
}

const DOW_WEIGHT = [0, 1, 1.08, 1.04, 0.98, 0.9, 0.42, 0.22];

export function demoGerencial(days: Period): Gerencial {
  const rand = rng(7 + days);
  const today = new Date();
  const daily = Array.from({ length: days }, (_, i) => {
    const date = subDays(today, days - 1 - i);
    const dow = ((date.getDay() + 6) % 7) + 1;
    const trend = 0.82 + (i / days) * 0.3;
    const base = 46 * DOW_WEIGHT[dow]! * trend;
    const inbound = Math.round(base * (0.85 + rand() * 0.3));
    return {
      day: format(date, "yyyy-MM-dd"),
      in: inbound,
      out: Math.round(inbound * (1.15 + rand() * 0.2)),
      leads: Math.round(inbound * (0.18 + rand() * 0.08)),
      frt: dow >= 6 ? null : Math.round(200 + rand() * 140 - (i / days) * 60),
    };
  });

  const heatmap = [];
  for (let dow = 1; dow <= 7; dow += 1) {
    for (let hour = 7; hour <= 22; hour += 1) {
      const n = Math.round(
        9 * DOW_WEIGHT[dow]! * hourWeight(hour) * (days / 7) * (0.8 + rand() * 0.4),
      );
      if (n > 0) heatmap.push({ dow, hour, n });
    }
  }

  const totalIn = daily.reduce((s, d) => s + d.in, 0);
  const totalOut = daily.reduce((s, d) => s + d.out, 0);
  const scale = days / 30;

  return {
    days,
    kpis: {
      messages_in: totalIn,
      messages_in_prev: Math.round(totalIn * 0.87),
      messages_out: totalOut,
      messages_out_prev: Math.round(totalOut * 0.84),
      conversations: Math.round(428 * scale),
      conversations_prev: Math.round(371 * scale),
      new_leads: Math.round(186 * scale),
      new_leads_prev: Math.round(152 * scale),
      hot_leads: 37,
      frt_avg: 252,
      frt_avg_prev: 307,
      frt_median: 168,
      frt_sla_pct: 82,
      ai_answered: Math.round(141 * scale),
      pipeline_value: 482_900,
      pipeline_count: 64,
      pipeline_potential: 571_300,
      items_deals: 41,
      forecast_value: 198_400,
      won_value: Math.round(126_400 * scale),
      won_value_prev: Math.round(108_700 * scale),
      won_count: Math.round(23 * scale),
      lost_count: Math.round(9 * scale),
      open_conversations: 58,
      unread: 21,
      waiting: 7,
      oldest_waiting_at: new Date(Date.now() - 23 * 60_000).toISOString(),
      classified: Math.round(612 * scale),
      avg_score: 61,
    },
    daily,
    heatmap,
    channels: [
      { platform: "whatsapp", share: 0.52, frt: 198 },
      { platform: "instagram", share: 0.21, frt: 274 },
      { platform: "facebook", share: 0.12, frt: 331 },
      { platform: "tiktok", share: 0.09, frt: 402 },
      { platform: "telegram", share: 0.06, frt: 240 },
    ].map((c) => {
      const total = Math.round((totalIn + totalOut) * c.share);
      return {
        platform: c.platform,
        in: Math.round(total * 0.45),
        out: Math.round(total * 0.55),
        total,
        conversations: Math.round(428 * scale * c.share),
        frt: c.frt,
      };
    }),
    funnel: [
      { name: "Novo", kind: "open", probability: 10, count: 96, value: 214_300 },
      { name: "Qualificado", kind: "open", probability: 30, count: 41, value: 132_800 },
      { name: "Proposta", kind: "open", probability: 55, count: 19, value: 86_200 },
      { name: "Negociação", kind: "open", probability: 80, count: 8, value: 49_600 },
      {
        name: "Ganho",
        kind: "won",
        probability: 100,
        count: Math.round(23 * scale),
        value: Math.round(126_400 * scale),
      },
    ].map((s, i) => ({ ...s, id: `demo-${i}`, position: i })),
    team: [
      {
        name: "Beatriz Moura",
        role: "seller",
        replies: 612,
        frt: 186,
        won_count: 9,
        won_value: 52_300,
        open: 14,
      },
      {
        name: "Rafael Lima",
        role: "agent",
        replies: 548,
        frt: 212,
        won_count: 0,
        won_value: 0,
        open: 18,
      },
      {
        name: "Camila Duarte",
        role: "seller",
        replies: 471,
        frt: 244,
        won_count: 7,
        won_value: 41_800,
        open: 11,
      },
      {
        name: "Thiago Nunes",
        role: "seller",
        replies: 389,
        frt: 297,
        won_count: 5,
        won_value: 24_100,
        open: 9,
      },
      {
        name: "IA Vínculo",
        role: "agent",
        replies: 302,
        frt: 9,
        won_count: 0,
        won_value: 0,
        open: 6,
      },
    ].map((m, i) => ({
      user_id: `demo-${i}`,
      name: m.name,
      avatar_url: null,
      role: m.role,
      open_conversations: m.open,
      replies: Math.round(m.replies * scale),
      frt: m.frt,
      won_count: Math.round(m.won_count * scale),
      won_value: Math.round(m.won_value * scale),
    })),
    temperature: { hot: 37, warm: 118, cold: 204, unclassified: 41 },
  };
}

export const DEMO_HOT_LEADS = [
  {
    id: "d1",
    name: "Marina Albuquerque",
    company: "Clínica Vitta",
    source: "whatsapp",
    score: 92,
    next: "Enviar proposta do plano anual hoje; pediu prazo até sexta.",
  },
  {
    id: "d2",
    name: "Eduardo Paiva",
    company: "Paiva Engenharia",
    source: "instagram",
    score: 87,
    next: "Agendar visita técnica; perguntou disponibilidade na semana que vem.",
  },
  {
    id: "d3",
    name: "Luana Ferraz",
    company: "Studio LF",
    source: "facebook",
    score: 81,
    next: "Confirmar forma de pagamento; já aprovou o orçamento.",
  },
  {
    id: "d4",
    name: "Henrique Sato",
    company: "Sato Distribuidora",
    source: "whatsapp",
    score: 78,
    next: "Ligar para negociar volume; comparou com concorrente.",
  },
];

export const DEMO_EVENTS = [
  { id: "e1", time: "09:30", duration: "30 min", title: "Daily do atendimento", who: "Equipe" },
  {
    id: "e2",
    time: "11:00",
    duration: "45 min",
    title: "Demonstração · Clínica Vitta",
    who: "Marina Albuquerque",
  },
  {
    id: "e3",
    time: "15:30",
    duration: "1 h",
    title: "Negociação · Sato Distribuidora",
    who: "Henrique Sato",
  },
];

// Exemplo do "O que precisa de você" para conta sem movimento (rotulado como exemplo na tela).
export const DEMO_ATTENTION: AttentionItem[] = [
  {
    key: "dt1",
    kind: "ticket_late",
    title: "Chamado #4892: troca de produto com avaria",
    reason: "Prazo estourado: solução atrasada 2 h.",
    ref: "demo",
    at: "",
  },
  {
    key: "dh1",
    kind: "hot_waiting",
    title: "Lead quente sem resposta: Marina Albuquerque",
    reason: "3 mensagens não lidas, escreveu há 12 minutos.",
    ref: "demo",
    at: "",
  },
  {
    key: "dh2",
    kind: "handoff",
    title: "A IA passou Eduardo Paiva para a equipe",
    reason: "Pediu condição especial de pagamento. Ninguém assumiu ainda, desde há 25 minutos.",
    ref: "demo",
    at: "",
  },
  {
    key: "dd1",
    kind: "deal_stalled",
    title: "Negócio parado: Plano anual Sato Distribuidora",
    reason: "R$ 5.200,00 com Henrique Sato, sem movimento desde há 9 dias.",
    ref: "demo",
    at: "",
  },
];
