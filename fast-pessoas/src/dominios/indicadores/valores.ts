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
import { ESCOPO_GLOBAL, formatarValorMeta } from "./esquemas";
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

export type SituacaoFarol = "dentro" | "fora" | "sem_meta" | "sem_dados";

export interface ValorIndicador {
  indicador_id: number;
  chave: string;
  valor: number | null;
  valor_formatado: string | null;
  detalhe: string | null;
  meta: { valor: number; inicio_vigencia: string } | null;
  situacao: SituacaoFarol;
}

/**
 * Apura o valor atual de cada indicador COM fonte e o confronta com a meta
 * global vigente (farol). Indicadores sem fonte ficam de fora — quem consome
 * trata a ausência como "sem dados".
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
      const metaGlobal =
        metas.find(
          (meta) =>
            meta.indicador_id === indicador.id && meta.escopo === ESCOPO_GLOBAL
        ) ?? null;

      let situacao: SituacaoFarol;
      if (valor === null) {
        situacao = "sem_dados";
      } else if (!metaGlobal) {
        situacao = "sem_meta";
      } else {
        const dentro =
          indicador.direcao === "maior"
            ? valor >= metaGlobal.valor
            : valor <= metaGlobal.valor;
        situacao = dentro ? "dentro" : "fora";
      }

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
      };
    })
  );
}
