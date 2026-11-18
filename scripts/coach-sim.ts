// Simulador do agente da reunião: faz o papel do worker (src em worker/) trocando só o STT por
// frases roteirizadas. Usa o MESMO motor (src/features/coach/engine.ts), grava transcrição e dicas
// pela rota do agente e manda as dicas ao vendedor pelo canal de dados do LiveKit.
// Uso: AGENT_SECRET=... LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... bun scripts/coach-sim.ts <sala> [base]
import { createHmac } from "node:crypto";

import {
  INITIAL_STATE,
  pendingItems,
  processUtterance,
  progress,
  type CoachState,
} from "../src/features/coach/engine";
import type { PlaybookContent } from "../src/features/playbooks/types";

const room = process.argv[2]!;
const base = process.argv[3] ?? "http://localhost:5173";
const secret = process.env["AGENT_SECRET"]!;
const lk = {
  url: process.env["LIVEKIT_URL"]!,
  key: process.env["LIVEKIT_API_KEY"]!,
  secret: process.env["LIVEKIT_API_SECRET"]!,
};

const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");
function token(): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(
    JSON.stringify({
      iss: lk.key,
      sub: "coach-sim",
      nbf: now - 5,
      exp: now + 300,
      video: { roomAdmin: true, room },
    }),
  );
  return `${head}.${body}.${b64(createHmac("sha256", lk.secret).update(`${head}.${body}`).digest())}`;
}

async function agent(action: string, extra: Record<string, unknown>) {
  const res = await fetch(`${base}/api/agent/meeting`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-secret": secret },
    body: JSON.stringify({ action, room, ...extra }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${action}: ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function sendData(identity: string, payload: unknown) {
  const res = await fetch(
    `${lk.url.replace(/^wss:/, "https:")}/twirp/livekit.RoomService/SendData`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: JSON.stringify({
        room,
        data: Buffer.from(JSON.stringify(payload)).toString("base64"),
        kind: "RELIABLE",
        destination_identities: [identity],
        topic: "coach",
      }),
    },
  );
  return res.status;
}

const SCRIPT: [boolean, string][] = [
  [
    true,
    "Oi Mariana, obrigado pelo tempo. Antes de começar: a reunião está sendo gravada, tudo bem? A pauta de hoje é entender o cenário de vocês.",
  ],
  [false, "Tudo bem. Hoje a gente controla tudo numa planilha e o time perde muito tempo."],
  [true, "Entendi. Qual o maior desafio hoje e quanto tempo vocês perdem por semana com isso?"],
  [false, "Uns dois dias por semana. Mas sendo sincera, achei caro o valor que vi no site."],
  [false, "A gente também está olhando o RD Station."],
  [
    true,
    "Faz sentido. Quem decide junto com você e qual o orçamento previsto para este trimestre?",
  ],
  [false, "Sou eu e o diretor. E em quanto tempo fica pronto se a gente fechar?"],
];

const ctx = (await agent("context", {})) as { seller_identity: string; playbook: PlaybookContent };
console.log(
  "contexto ok; vendedor =",
  ctx.seller_identity,
  "· playbook fases =",
  ctx.playbook.phases.length,
);
let state: CoachState = INITIAL_STATE;
let t = 0;
for (const [isSeller, text] of SCRIPT) {
  const dur = Math.max(2500, text.length * 55);
  const r = processUtterance(state, ctx.playbook, { text, isSeller, startMs: t, endMs: t + dur });
  state = r.state;
  await agent("transcript", {
    segments: [
      {
        identity: isSeller ? ctx.seller_identity : "contact-sim",
        name: isSeller ? "Vendedor" : "Mariana",
        is_seller: isSeller,
        text,
        start_ms: t,
        end_ms: t + dur,
      },
    ],
  });
  const checklist = {
    covered: state.covered,
    pending: pendingItems(state, ctx.playbook).map((p) => ({
      id: p.id,
      label: p.label,
      phase: p.phase,
    })),
    progress: progress(state, ctx.playbook),
  };
  if (r.tips.length)
    await agent("tips", { tips: r.tips.map((x) => ({ ...x, source: "keyword" })) });
  const st = await sendData(ctx.seller_identity, { tips: r.tips, checklist });
  console.log(
    `${isSeller ? "VENDEDOR" : "CLIENTE "} "${text.slice(0, 50)}…" → ${r.tips.map((x) => `${x.kind}:${x.title}`).join(" | ") || "—"} · roteiro ${Math.round(checklist.progress * 100)}% · data ${st}`,
  );
  t += dur + 800;
  await new Promise((res) => setTimeout(res, 2500));
}
