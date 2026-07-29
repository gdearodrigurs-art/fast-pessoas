import { ErroHttp } from "@/lib/sessao";

/** Converte o parâmetro de rota em id numérico ou lança 400. */
export function idProcesso(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroHttp(400, "Identificador inválido");
  }
  return id;
}
