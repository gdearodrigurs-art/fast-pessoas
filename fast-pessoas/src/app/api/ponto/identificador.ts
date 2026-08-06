import { ErroHttp } from "@/lib/sessao";

/** Converte o parâmetro de rota em id numérico ou lança 400. */
export function idPonto(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroHttp(400, "Identificador inválido");
  }
  return id;
}

/**
 * Dia civil vindo da query string, obrigatório. Sem padrão de propósito: "o
 * dia" de uma correção de ponto vem sempre da intercorrência que a motivou, e
 * adivinhar "hoje" aqui gravaria ajuste no dia errado.
 */
export function dataDaBusca(url: string, parametro = "data"): string {
  const valor = new URL(url).searchParams.get(parametro);
  if (
    valor === null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
    Number.isNaN(Date.parse(`${valor}T00:00:00Z`))
  ) {
    throw new ErroHttp(400, "Informe a data no formato AAAA-MM-DD");
  }
  return valor;
}

/**
 * Competência vinda da query string. Ausente = a última FECHADA (o mês
 * passado), que é o que o DP e a diretoria olham por padrão.
 */
export function competenciaDaBusca(
  url: string,
  padrao: { ano: number; mes: number }
): { ano: number; mes: number } {
  const busca = new URL(url).searchParams;
  const anoTexto = busca.get("ano");
  const mesTexto = busca.get("mes");
  if (anoTexto === null && mesTexto === null) return padrao;
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  if (
    !Number.isInteger(ano) ||
    ano < 2020 ||
    ano > 2100 ||
    !Number.isInteger(mes) ||
    mes < 1 ||
    mes > 12
  ) {
    throw new ErroHttp(400, "Competência inválida — informe ano e mês");
  }
  return { ano, mes };
}
