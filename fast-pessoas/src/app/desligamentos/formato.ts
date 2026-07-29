// Datas ficam em UTC no banco; toda exibição usa America/Sao_Paulo explícito.

const FORMATO_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatarDataHora(iso: string): string {
  return FORMATO_SP.format(new Date(iso));
}

/** Data-calendário (AAAA-MM-DD) — sem fuso, só reordena. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Semáforo do prazo do art. 477 (10 dias corridos do término). */
export function textoPrazo477(dias: number): string {
  if (dias < 0) {
    const estourado = -dias;
    return `477 estourado há ${estourado} dia${estourado > 1 ? "s" : ""}`;
  }
  if (dias === 0) return "477 vence hoje";
  return `477 em ${dias} dia${dias > 1 ? "s" : ""}`;
}
