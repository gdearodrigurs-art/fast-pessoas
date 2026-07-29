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

export function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function textoPrazo(dias: number): string {
  if (dias < 0) {
    const passados = -dias;
    return `prazo vencido há ${passados} dia${passados > 1 ? "s" : ""}`;
  }
  if (dias === 0) return "prazo vence hoje";
  return `prazo em ${dias} dia${dias > 1 ? "s" : ""}`;
}
