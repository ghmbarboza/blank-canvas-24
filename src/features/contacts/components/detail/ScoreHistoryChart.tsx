import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDateTime } from "@/lib/format";

type Point = { created_at: string; score: number };

type Props = { points: Point[] };

// Histórico curto de scores (mais antigo à esquerda). Com um ponto só não há linha para contar história.
export function ScoreHistoryChart({ points }: Props) {
  if (points.length < 2) {
    return (
      <p className="text-[12px] text-subtle">
        O histórico aparece a partir da segunda classificação.
      </p>
    );
  }
  const data = points.map((p) => ({ t: p.created_at, score: p.score }));
  const first = points[0]?.score ?? 0;
  const last = points[points.length - 1]?.score ?? 0;
  return (
    <figure>
      <figcaption className="sr-only">
        Score foi de {first} para {last} em {points.length} classificações
      </figcaption>
      <div className="h-20" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(t: string) => formatDateTime(t)}
              formatter={(v: number) => [v, "Score"]}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
