import { StatusPeriodo } from "./esquemas";

/**
 * MOTOR PURO DO GERADOR DE PERÍODOS AQUISITIVOS — datas entram, períodos saem.
 *
 * Extraído de servico.ts na frente 1.7 (dívida B6/B8 da pendência #15) para a
 * régua ganhar teste unitário sem arrastar o banco junto: aqui não há I/O
 * nenhum, no molde de pdi/calculo.ts. A metade que TOCA o banco — materializar
 * em lote o que falta (repositorio.inserirPeriodosEmLote, ON CONFLICT DO
 * NOTHING) e ler o que já existe (listarIniciosExistentes) — é provada contra o
 * banco em db/provas-ferias.js; esta metade, sem banco, em tests/ferias.test.ts.
 */

/**
 * ESTE FOI O NÚMERO DE NEGÓCIO CHUMBADO NO MÓDULO DE FÉRIAS, e a varredura de
 * 2026-07 o deixou DECLARADO em vez de disfarçado.
 *
 * O que ele faz: `fim do aquisitivo + N meses` é a data gravada em
 * rh.periodo_aquisitivo.limite_concessivo, e é ela — e só ela — que faz o
 * painel dizer "VENCIDA — dobro (art. 137)". Ou seja, é o limite que decide se
 * o sistema afirma que a empresa deve férias em dobro.
 *
 * Por que já foi 11: o art. 134 manda CONCEDER nos 12 meses seguintes ao
 * aquisitivo, e conceder é o gozo inteiro caber dentro da janela — com 30 dias
 * de gozo, a última data de INÍCIO fica ~1 mês antes do fim dos 12. Era uma
 * INTERPRETAÇÃO, não o texto da lei.
 *
 * DECISÃO DO DONO (pendência #3, 11/08/2026): SEPARAR as duas coisas que o 11
 * colava. O limite LEGAL do "dobro" (art. 134: "nos 12 meses subsequentes") é
 * 12 e é LEI, não escolha — é este número, e é o que decide "VENCIDA — dobro".
 * A migration 0062 reconciliou as linhas antigas: recomputou limite = fim + 12 e
 * desvenceu quem a régua de 11 tinha marcado cedo demais.
 *
 * O 11 vira um ALERTA administrável — o aviso antecipado ao DP, que NÃO afirma
 * dobro — numa fatia seguinte (tabela de parâmetro + tela). Pendência #3.
 */
const MESES_LIMITE_CONCESSIVO = 12;

// ------------------------------------------------------------------ datas (UTC no banco, SP na régua)

function paraUtc(dataIso: string): Date {
  return new Date(`${dataIso}T00:00:00Z`);
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function adicionarAnos(dataIso: string, anos: number): string {
  const data = paraUtc(dataIso);
  data.setUTCFullYear(data.getUTCFullYear() + anos);
  return paraIso(data);
}

function adicionarMeses(dataIso: string, meses: number): string {
  const data = paraUtc(dataIso);
  const dia = data.getUTCDate();
  data.setUTCMonth(data.getUTCMonth() + meses);
  // Estouro de mês (ex.: 28/02 + 12 meses caindo em ano sem 29): trava no
  // último dia do mês.
  if (data.getUTCDate() !== dia) {
    data.setUTCDate(0);
  }
  return paraIso(data);
}

export function adicionarDias(dataIso: string, dias: number): string {
  const data = paraUtc(dataIso);
  data.setUTCDate(data.getUTCDate() + dias);
  return paraIso(data);
}

// ------------------------------------------------------------------ régua dos períodos

export interface PeriodoEsperado {
  inicio: string;
  fim: string;
  limite_concessivo: string;
  status: StatusPeriodo;
}

/**
 * Ciclos de 12 meses a partir da admissão, um por aniversário, até hoje.
 * 30 dias de direito por ciclo; vencido quando o limite concessivo passou.
 */
export function periodosEsperados(
  dataAdmissao: string,
  hoje: string
): PeriodoEsperado[] {
  const periodos: PeriodoEsperado[] = [];
  let inicio = dataAdmissao;
  // Trava de segurança: ninguém tem mais de 80 ciclos de férias.
  for (let ciclo = 0; ciclo < 80 && inicio <= hoje; ciclo += 1) {
    const fim = adicionarDias(adicionarAnos(inicio, 1), -1);
    const limite = adicionarMeses(fim, MESES_LIMITE_CONCESSIVO);
    periodos.push({
      inicio,
      fim,
      limite_concessivo: limite,
      status: limite < hoje ? "vencido" : "em_aberto",
    });
    inicio = adicionarAnos(inicio, 1);
  }
  return periodos;
}

/**
 * Parte PURA de garantirPeriodos: dado o que já está persistido (pares
 * colaborador × início), quais períodos esperados ainda faltam materializar.
 * A chave composta é o que torna o gerador idempotente — rodar duas vezes com
 * o resultado da primeira já gravado devolve vazio — e é a MESMA unicidade do
 * banco (UNIQUE colaborador_id, inicio), que segura a corrida que esta função,
 * pura, não enxerga.
 */
export function periodosFaltantes(
  colaboradores: { id: number; data_admissao: string }[],
  existentes: { colaborador_id: number; inicio: string }[],
  hoje: string
): (PeriodoEsperado & { colaborador_id: number })[] {
  const chaves = new Set(
    existentes.map((linha) => `${linha.colaborador_id}|${linha.inicio}`)
  );
  const faltantes: (PeriodoEsperado & { colaborador_id: number })[] = [];
  for (const colaborador of colaboradores) {
    for (const periodo of periodosEsperados(colaborador.data_admissao, hoje)) {
      if (!chaves.has(`${colaborador.id}|${periodo.inicio}`)) {
        faltantes.push({ ...periodo, colaborador_id: colaborador.id });
      }
    }
  }
  return faltantes;
}
