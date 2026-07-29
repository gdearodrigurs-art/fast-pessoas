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

export function textoInicioPrevisto(diasAteInicio: number): string {
  if (diasAteInicio < 0) {
    const dias = -diasAteInicio;
    return `início previsto há ${dias} dia${dias > 1 ? "s" : ""}`;
  }
  if (diasAteInicio === 0) return "começa hoje";
  return `começa em ${diasAteInicio} dia${diasAteInicio > 1 ? "s" : ""}`;
}

export function textoVencimento(dias: number): string {
  if (dias < 0) {
    const passados = -dias;
    return `venceu há ${passados} dia${passados > 1 ? "s" : ""}`;
  }
  if (dias === 0) return "vence hoje";
  return `vence em ${dias} dia${dias > 1 ? "s" : ""}`;
}
