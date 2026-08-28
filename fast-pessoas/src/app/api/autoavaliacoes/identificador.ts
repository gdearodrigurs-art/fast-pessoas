import { ErroHttp } from "@/lib/sessao";

/** Converte o parâmetro de rota (id do ciclo) em número ou lança 400. */
export function idCiclo(valor: string): number {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroHttp(400, "Identificador inválido");
  }
  return id;
}
