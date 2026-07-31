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
