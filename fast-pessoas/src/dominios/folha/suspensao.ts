// Suspensão disciplinar → folha (decisão D2:a) — a parte PURA: recortar a
// janela da suspensão pela competência e apontar os DSRs perdidos. Sem IO e
// sem banco; datas entram e saem como ISO (AAAA-MM-DD) e toda aritmética é de
// CALENDÁRIO em UTC, o mesmo molde de dataReferenciaCompetencia — nada de fuso
// empurrando o dia.
//
// A REGRA (D2:a, validar com o contador — registrado como AVISO, não bloqueio):
//   • desconta os dias CORRIDOS da janela DENTRO da competência; janela que
//     cruza mês desconta em cada competência a sua parte;
//   • valor-dia = salário ÷ divisor mensal de dias (o motor aplica; aqui só se
//     contam os dias);
//   • desconta TAMBÉM o DSR da semana da suspensão (Lei 605/49, molde da falta
//     injustificada). O motor mensal TEM mecânica de DSR (1202), mas ela é
//     "1 dia de DSR por dia de falta" — a simplificação F1 presa ao lançamento
//     de faltas (variável 1201), que superdescontaria uma suspensão de 5 dias
//     na mesma semana em 5 DSRs. Para a suspensão vale a régua da própria lei:
//     1 valor-dia POR SEMANA CIVIL com dia de suspensão.
//
// COMO A SEMANA CONTA (a parte fina, e o porquê de cada pedaço):
//   • Semana civil da Lei 605/49: segunda a domingo, com o repouso no domingo.
//     O domingo D é perdido quando houve suspensão em [D−6, D−1] (a semana de
//     trabalho que o antecede).
//   • O DSR pertence à competência DO DOMINGO. É isso que impede o desconto em
//     dobro quando a semana cruza o mês: cada domingo tem um dono só. Por
//     consequência, uma suspensão no fim do mês pode derrubar um DSR no mês
//     SEGUINTE — e é por isso que o serviço busca medidas com janela
//     intersectando a competência ESTENDIDA 6 dias para trás.
//   • Suspensão que só toca o próprio domingo não derruba o DSR daquele
//     domingo: o repouso não é dia de trabalho perdido — mas o dia corrido
//     conta no desconto de dias normalmente.

/** O recorte de UMA janela de suspensão numa competência. */
export interface SuspensaoNaCompetencia {
  /** Dias corridos da janela dentro do mês (0 quando só o DSR sobrou aqui). */
  dias: number;
  /** Domingos do mês (ISO) cujo DSR cai — semana anterior com suspensão. */
  domingos_dsr: string[];
}

const DIA_MS = 24 * 60 * 60 * 1000;

function paraUtc(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function paraIso(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/**
 * Recorta a janela [inicio, fim] da suspensão pela competência (ano, mês).
 * `fim` NULL é janela ABERTA (suspensão em curso, a 0080 permite): conta até
 * onde a competência alcança — quando o DP fechar o fim, o recálculo acerta.
 */
export function apurarSuspensaoNaCompetencia(
  ano: number,
  mes: number,
  inicioIso: string,
  fimIso: string | null
): SuspensaoNaCompetencia {
  const primeiroDia = Date.UTC(ano, mes - 1, 1);
  const ultimoDia = Date.UTC(ano, mes, 0);
  const inicio = paraUtc(inicioIso);
  // Janela aberta alcança tudo para a frente — o teto prático é o fim do mês
  // (dias) e o último domingo do mês (DSR), então o fim do mês basta.
  const fim = fimIso === null ? ultimoDia : paraUtc(fimIso);
  if (fim < inicio) {
    // Janela invertida não existe (CHECK no banco); pura defesa.
    return { dias: 0, domingos_dsr: [] };
  }

  // Dias corridos: |[inicio, fim] ∩ [primeiro, último dia do mês]|.
  const recorteInicio = Math.max(inicio, primeiroDia);
  const recorteFim = Math.min(fim, ultimoDia);
  const dias =
    recorteFim < recorteInicio
      ? 0
      : Math.round((recorteFim - recorteInicio) / DIA_MS) + 1;

  // DSR: para cada DOMINGO do mês, a semana de trabalho é [D−6, D−1]
  // (segunda a sábado). Havendo interseção com a janela, o domingo cai.
  const domingos: string[] = [];
  for (let dia = primeiroDia; dia <= ultimoDia; dia += DIA_MS) {
    if (new Date(dia).getUTCDay() !== 0) continue;
    const semanaInicio = dia - 6 * DIA_MS;
    const semanaFim = dia - DIA_MS;
    if (inicio <= semanaFim && fim >= semanaInicio) {
      domingos.push(paraIso(dia));
    }
  }

  return { dias, domingos_dsr: domingos };
}

/**
 * A data em que o serviço COMEÇA a procurar medidas para uma competência:
 * 6 dias antes do dia 1º — uma suspensão que terminou no fim do mês anterior
 * ainda derruba o DSR do primeiro domingo deste mês (a semana [D−6, D−1] pode
 * começar no mês passado).
 */
export function inicioBuscaSuspensao(ano: number, mes: number): string {
  return paraIso(Date.UTC(ano, mes - 1, 1) - 6 * DIA_MS);
}
