import { valorIndicadorAdmissoesNoPrazo } from "../admissao/servico";
import { valorIndicadorAdesaoCheckin } from "../clima/servico";
import { valorIndicadorEntrevistas } from "../desligamento/servico";
import { valorIndicadorFeriasVencidas } from "../ferias/servico";
import { valorIndicadorFolhaNoPrazo } from "../folha/servico";
import {
  valorIndicadorAdesaoPesquisa,
  valorIndicadorEnps,
} from "../pesquisas/servico";
import {
  detalheIndicadorSaldoBancoHoras,
  valorIndicadorHorasExtras,
  valorIndicadorSaldoBancoHoras,
} from "../ponto/servico";
import { valorIndicadorVagasNoPrazo } from "../recrutamento/servico";
import {
  valorIndicadorAsosValidos,
  valorIndicadorPsicossocialValida,
} from "../sst/servico";
import { formatarValorMeta } from "./esquemas";
import { listarIndicadoresAtivos, listarMetasVigentes } from "./repositorio";

/**
 * Registry de FONTES de valor: chave do catálogo (rh.indicador.chave) ->
 * função de apuração exportada pelo domínio dono do dado. Indicadores fora
 * deste mapa ainda não têm fonte no sistema — a tela mostra "sem dados".
 * Cada fonte usa apenas agregados (contagens/percentuais), nunca conteúdo
 * sensível.
 */
interface ValorApurado {
  valor: number | null;
  detalhe: string | null;
}

const FONTES: Record<string, () => Promise<ValorApurado>> = {
  entrevista_desligamento: async () => {
    const { realizadas, elegiveis, percentual } =
      await valorIndicadorEntrevistas();
    return {
      valor: percentual,
      detalhe:
        percentual === null
          ? "nenhum desligamento elegível encerrado em 12 meses"
          : `${realizadas} de ${elegiveis} entrevistas realizadas (12 meses)`,
    };
  },
  ferias_vencidas: async () => ({
    valor: await valorIndicadorFeriasVencidas(),
    detalhe: "períodos aquisitivos vencidos sem gozo",
  }),
  admissao_prazo: async () => {
    const valor = await valorIndicadorAdmissoesNoPrazo();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhum processo concluído em 12 meses"
          : "processos concluídos até a data de início prevista (12 meses)",
    };
  },
  vagas_no_prazo: async () => {
    const valor = await valorIndicadorVagasNoPrazo();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhuma vaga fechada em 12 meses"
          : "vagas fechadas até o prazo-alvo (12 meses)",
    };
  },
  folha_no_prazo: async () => {
    const valor = await valorIndicadorFolhaNoPrazo();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhuma competência mensal com prazo vencido"
          : "competências mensais fechadas até o dia 5 do mês seguinte (12 meses)",
    };
  },
  adesao_checkin: async () => {
    const valor = await valorIndicadorAdesaoCheckin();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhum dia com check-in nos últimos 30 dias"
          : "média diária de respondentes ÷ ativos (dias com check-in, 30 dias)",
    };
  },
  adesao_pesquisa: async () => {
    const valor = await valorIndicadorAdesaoPesquisa();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhuma pesquisa de clima encerrada"
          : "participantes da última pesquisa encerrada ÷ colaboradores ativos",
    };
  },
  enps: async () => {
    const valor = await valorIndicadorEnps();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhuma pesquisa encerrada com pergunta de eNPS e amostra mínima"
          : // A unidade do catálogo é '%' por limitação do CHECK de
            // rh.indicador (ver 0022): o número são PONTOS de eNPS (−100 a
            // +100), e o detalhe diz isso para a tela não mentir.
            "promotores (9–10) menos detratores (0–6), em pontos, na última pesquisa encerrada",
    };
  },
  horas_extras: async () => {
    const valor = await valorIndicadorHorasExtras();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhuma competência de ponto apurada nos últimos 12 meses"
          : "HE 50% + HE 100% ÷ horas trabalhadas nas apurações de ponto (12 meses)",
    };
  },
  // Passivo, não percentual: anda ao lado de horas_extras porque um mês sem HE
  // não significa banco zerado — o saldo é acumulado e sobrevive à competência.
  saldo_banco_horas: async () => {
    const valor = await valorIndicadorSaldoBancoHoras();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhum movimento de banco de horas"
          : await detalheIndicadorSaldoBancoHoras(),
    };
  },
  asos_validos: async () => {
    const valor = await valorIndicadorAsosValidos();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhum colaborador ativo"
          : "colaboradores ativos com ASO vigente",
    };
  },
  // A "segunda linha" da diretoria: anda AO LADO de asos_validos, não no lugar.
  psicossocial_valida: async () => {
    const valor = await valorIndicadorPsicossocialValida();
    return {
      valor,
      detalhe:
        valor === null
          ? "nenhum colaborador ativo"
          : "colaboradores ativos com avaliação psicossocial (NR-1) vigente",
    };
  },
};

/**
 * Registry de FONTES RECORTADAS POR UNIDADE: mesma chave do catálogo, mas a
 * função recebe o estabelecimento e devolve o número DAQUELA unidade.
 *
 * Está vazio de propósito, e essa é a informação importante: NENHUMA das fontes
 * acima sabe recortar por unidade hoje — todas devolvem um número da empresa
 * inteira. Enquanto uma chave não estiver aqui, a meta por unidade daquele
 * indicador é reportada como `sem_apuracao` e a tela diz isso com todas as
 * letras, em vez de desenhar o número da meta ao lado do farol global e deixar
 * parecer que alguém está medindo aquilo.
 *
 * Para instrumentar um indicador por unidade basta acrescentar a chave aqui —
 * o farol por unidade passa a existir sozinho, sem mexer na tela. Atenção ao
 * fazer isso em indicador de clima/pesquisa: o recorte por unidade reduz a
 * amostra e tem de respeitar o piso de anonimato do domínio.
 */
const FONTES_POR_UNIDADE: Record<
  string,
  (estabelecimentoId: number) => Promise<ValorApurado>
> = {};

export type SituacaoFarol =
  | "dentro"
  | "fora"
  | "sem_meta"
  | "sem_dados"
  /** Meta pactuada num recorte que o sistema ainda não sabe apurar. */
  | "sem_apuracao";

/** Farol de uma meta por unidade — um por meta, não um por indicador. */
export interface ValorUnidade {
  meta_id: number;
  estabelecimento_id: number;
  /** Nome da unidade hoje (cai no nome congelado se a unidade sumiu). */
  unidade: string;
  meta_valor: number;
  inicio_vigencia: string;
  valor: number | null;
  valor_formatado: string | null;
  detalhe: string | null;
  situacao: SituacaoFarol;
}

export interface ValorIndicador {
  indicador_id: number;
  chave: string;
  valor: number | null;
  valor_formatado: string | null;
  detalhe: string | null;
  meta: { valor: number; inicio_vigencia: string } | null;
  situacao: SituacaoFarol;
  /** Uma entrada por meta de unidade ativa do indicador. */
  por_unidade: ValorUnidade[];
}

/** Compara valor com meta respeitando a direção do indicador. */
function confrontar(
  direcao: "maior" | "menor",
  valor: number,
  meta: number
): SituacaoFarol {
  const dentro = direcao === "maior" ? valor >= meta : valor <= meta;
  return dentro ? "dentro" : "fora";
}

/**
 * Apura o valor atual de cada indicador COM fonte e o confronta com a meta
 * vigente (farol). Indicadores sem fonte ficam de fora — quem consome trata a
 * ausência como "sem dados".
 *
 * A apuração é POR ESCOPO, não só global: a meta global é confrontada com o
 * número da empresa inteira e cada meta de unidade é confrontada com a fonte
 * recortada daquela unidade. Onde o recorte não existe (hoje, todos), a meta de
 * unidade sai com `sem_apuracao` — dizer "ninguém mede isto" é o oposto de
 * ignorá-la em silêncio, que era o que acontecia antes.
 */
export async function apurarValoresIndicadores(): Promise<ValorIndicador[]> {
  const [indicadores, metas] = await Promise.all([
    listarIndicadoresAtivos(),
    listarMetasVigentes(),
  ]);

  const comFonte = indicadores.filter((indicador) => FONTES[indicador.chave]);
  return Promise.all(
    comFonte.map(async (indicador) => {
      const { valor, detalhe } = await FONTES[indicador.chave]();
      const doIndicador = metas.filter(
        (meta) => meta.indicador_id === indicador.id
      );
      const metaGlobal =
        doIndicador.find((meta) => meta.estabelecimento_id === null) ?? null;

      let situacao: SituacaoFarol;
      if (valor === null) {
        situacao = "sem_dados";
      } else if (!metaGlobal) {
        situacao = "sem_meta";
      } else {
        situacao = confrontar(indicador.direcao, valor, metaGlobal.valor);
      }

      const apurarUnidade = FONTES_POR_UNIDADE[indicador.chave];
      const por_unidade = await Promise.all(
        doIndicador
          .filter((meta) => meta.estabelecimento_id !== null)
          .map(async (meta): Promise<ValorUnidade> => {
            const estabelecimentoId = meta.estabelecimento_id as number;
            const apurado = apurarUnidade
              ? await apurarUnidade(estabelecimentoId)
              : null;
            let situacaoUnidade: SituacaoFarol;
            if (apurado === null) {
              situacaoUnidade = "sem_apuracao";
            } else if (apurado.valor === null) {
              situacaoUnidade = "sem_dados";
            } else {
              situacaoUnidade = confrontar(
                indicador.direcao,
                apurado.valor,
                meta.valor
              );
            }
            return {
              meta_id: meta.id,
              estabelecimento_id: estabelecimentoId,
              unidade: meta.unidade ?? meta.escopo,
              meta_valor: meta.valor,
              inicio_vigencia: meta.inicio_vigencia,
              valor: apurado?.valor ?? null,
              valor_formatado:
                apurado?.valor === null || apurado?.valor === undefined
                  ? null
                  : formatarValorMeta(apurado.valor, indicador.unidade),
              detalhe: apurado?.detalhe ?? null,
              situacao: situacaoUnidade,
            };
          })
      );

      return {
        indicador_id: indicador.id,
        chave: indicador.chave,
        valor,
        valor_formatado:
          valor === null ? null : formatarValorMeta(valor, indicador.unidade),
        detalhe,
        meta: metaGlobal
          ? {
              valor: metaGlobal.valor,
              inicio_vigencia: metaGlobal.inicio_vigencia,
            }
          : null,
        situacao,
        por_unidade,
      };
    })
  );
}
