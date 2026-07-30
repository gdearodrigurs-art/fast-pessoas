// Formatação de exibição do painel. Datas ficam em UTC no banco e chegam aqui
// já convertidas para America/Sao_Paulo pelo repositório, no formato AAAA-MM-DD
// — por isso a formatação é textual: criar `new Date("2026-07-29")` reintroduz
// o fuso do navegador e é assim que painel mostra o dia anterior.

export function data(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07" → "jul/26" (rótulo do eixo da micro-série, tem que ser curto). */
export function mesCurto(mes: string): string {
  const [ano, mm] = mes.split("-");
  const indice = Number(mm) - 1;
  if (!ano || indice < 0 || indice > 11) return mes;
  return `${MESES_CURTOS[indice]}/${ano.slice(2)}`;
}

/** "2026-07" → "jul/2026". */
export function mesLongo(mes: string): string {
  const [ano, mm] = mes.split("-");
  const indice = Number(mm) - 1;
  if (!ano || indice < 0 || indice > 11) return mes;
  return `${MESES_CURTOS[indice]}/${ano}`;
}

export function inteiro(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function decimal(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function percentual(valor: number, casas = 1): string {
  return `${decimal(valor, casas)}%`;
}

export function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor compacto para caber no rótulo da micro-série (R$ 249,5 mil). */
export function moedaCurta(valor: number): string {
  if (Math.abs(valor) >= 1_000_000) {
    return `R$ ${decimal(valor / 1_000_000, 1)} mi`;
  }
  if (Math.abs(valor) >= 1_000) {
    return `R$ ${decimal(valor / 1_000, 1)} mil`;
  }
  return moeda(valor);
}
