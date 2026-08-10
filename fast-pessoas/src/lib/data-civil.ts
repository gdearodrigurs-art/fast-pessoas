import { z } from "zod";

/**
 * Data civil AAAA-MM-DD, validada de verdade.
 *
 * POR QUE ESTE ARQUIVO EXISTE: catorze módulos tinham, cada um, a MESMA cópia
 * de um validador fraco —
 *
 *     .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
 *
 * — e todas as catorze deixavam passar `2026-02-30`. `Date.parse` não recusa
 * data impossível: ele ROLA 30/02 para 02/03 e devolve um número válido. Aí a
 * data furada seguia até um `::date` no Postgres e estourava com um 500 feio no
 * lugar de um 400 limpo. Achado registrado em docs/pendencias.md #7.
 *
 * A trava honesta é o IDA-E-VOLTA: a data só é real se, convertida em Date e
 * formatada de novo, volta idêntica. `2026-02-30` vira `2026-03-02` e o
 * `===` reprova; `2026-09-01` volta igual e passa.
 *
 * Uma fonte só para que a próxima cópia não nasça fraca de novo (eixo "nada
 * chumbado" na sua forma de método: regra de validação mora num lugar, não
 * espalhada em catorze).
 */
export const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine(
    (valor) => {
      const d = new Date(`${valor}T00:00:00Z`);
      // `getTime()` NaN cobre o mês fora de faixa (2026-13-01 vira Invalid Date,
      // e chamar `toISOString()` nele LANÇA — precisa da guarda antes). O
      // ida-e-volta cobre o dia fora de faixa (30/02 rola para 02/03).
      return (
        !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
      );
    },
    { message: "Data inexistente no calendário" }
  );
