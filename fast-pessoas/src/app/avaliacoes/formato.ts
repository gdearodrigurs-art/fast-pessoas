/** AAAA-MM-DD → DD/MM/AAAA (data pura, sem fuso). */
export function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Timestamp UTC → exibição em America/Sao_Paulo. */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rótulo do prazo: "vence em N dias" / "vence hoje" / "vencida há N dias". */
export function rotuloPrazo(dias: number): string {
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === 1) return "vence amanhã";
  if (dias === 0) return "vence hoje";
  if (dias === -1) return "vencida há 1 dia";
  return `vencida há ${-dias} dias`;
}
