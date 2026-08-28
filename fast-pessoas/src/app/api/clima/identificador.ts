import { ErroHttp } from "@/lib/sessao";

/** Converte o [id] da rota em inteiro positivo, ou 400 "Identificador inválido". */
export function idClima(bruto: string): number {
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroHttp(400, "Identificador inválido.");
  }
  return id;
}
