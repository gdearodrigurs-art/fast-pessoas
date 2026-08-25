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

/**
 * Duração em dias (fração incluída) para gente ler: abaixo de 1 dia vira
 * horas ("18 h"); a partir de 1 dia, uma casa decimal ("3,5 dias").
 */
export function formatarDuracaoDias(dias: number): string {
  if (dias < 1) {
    const horas = Math.round(dias * 24);
    return horas < 1 ? "menos de 1 h" : `${horas} h`;
  }
  const texto = dias.toFixed(1).replace(".", ",").replace(/,0$/, "");
  return `${texto} dia${dias >= 2 ? "s" : ""}`;
}

export function textoPrazo(dias: number): string {
  if (dias < 0) {
    const passados = -dias;
    return `prazo vencido há ${passados} dia${passados > 1 ? "s" : ""}`;
  }
  if (dias === 0) return "prazo vence hoje";
  return `prazo em ${dias} dia${dias > 1 ? "s" : ""}`;
}
