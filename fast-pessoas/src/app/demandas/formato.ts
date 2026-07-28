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

/** Data-calendário (AAAA-MM-DD, ex.: prazo) — sem fuso, só reordena. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function textoPrazo(diasAtePrazo: number): string {
  if (diasAtePrazo < 0) {
    const dias = -diasAtePrazo;
    return `atrasada há ${dias} dia${dias > 1 ? "s" : ""}`;
  }
  if (diasAtePrazo === 0) return "vence hoje";
  return `vence em ${diasAtePrazo} dia${diasAtePrazo > 1 ? "s" : ""}`;
}
