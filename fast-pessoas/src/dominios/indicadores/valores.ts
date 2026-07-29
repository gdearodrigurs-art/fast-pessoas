import { valorIndicadorAdmissoesNoPrazo } from "../admissao/servico";
import { valorIndicadorEntrevistas } from "../desligamento/servico";
import { valorIndicadorFeriasVencidas } from "../ferias/servico";
import { valorIndicadorVagasNoPrazo } from "../recrutamento/servico";
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
