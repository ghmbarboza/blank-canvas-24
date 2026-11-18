// Grade da gravação em vídeo composto: n participantes em colunas ≈ √n, células de tamanho fixo.
export interface GridLayout {
  width: number;
  height: number;
  cells: { x: number; y: number }[];
}

export function gridLayout(n: number, cellW: number, cellH: number): GridLayout {
  const count = Math.max(1, Math.floor(n));
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cells = Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * cellW,
    y: Math.floor(i / cols) * cellH,
  }));
  return { width: cols * cellW, height: rows * cellH, cells };
}
