import type { Escopo } from "../colaboradores/repositorio";
import { resolverEscopo } from "../colaboradores/servico";
import { listarOpcoesDeFiltroEstrutura } from "../estrutura/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  ConsultaOrganograma,
  HeadcountOrganograma,
  NoOrganograma,
  NoPessoa,
  NoVaga,
  Organograma,
  PROFUNDIDADE_MAXIMA,
} from "./esquemas";
import {
  LinhaPessoa,
  LinhaVagaEmAberto,
  listarCargos,
  listarPessoasDoQuadro,
  listarVagasEmAberto,
} from "./repositorio";

// ------------------------------------------------------------------ montagem da árvore
// A árvore é DERIVADA, nunca armazenada: rh.relacao_gestor vigente é a única
// fonte de "quem lidera quem" (o papel `gestor` no login só habilita telas).
//
// HEADCOUNT APROVADO × REALIZADO — leia antes de mudar número nenhum:
//   realizado = pessoas no quadro (rh.colaborador.status <> 'desligado').
//   aprovado  = realizado + vagas em aberto de requisição APROVADA
//               (rh.requisicao_vaga.status = 'aprovada' e rh.vaga.status em
//               'aberta'/'congelada').
// NÃO existe no banco o conceito de QUADRO APROVADO FORMAL — orçamento de
// headcount por unidade/cargo aprovado pela diretoria, com vigência. O número
// acima é o melhor derivável do que existe: "posições autorizadas hoje". Ele
// NÃO responde "a diretoria autorizou 25 pessoas na Matriz e temos 22".
// EVOLUÇÃO FUTURA: tabela `rh.quadro_aprovado` (unidade × cargo × quantidade ×
// vigência × ato de aprovação) alimentada pela diretoria, e então
// requisicao_vaga passa a ser validada contra ela. Enquanto isso não existir,
// esta tela DIZ na cara do usuário o que cada número significa — não inventa.

interface ArvoreCompleta {
  porId: Map<number, NoPessoa>;
  raizes: NoPessoa[];
  paiDe: Map<number, number>;
  vagasSemNo: NoVaga[];
  profundidadeEstourada: boolean;
  /** Quem está REALMENTE dentro de um laço gestor→liderado (não quem pendurou nele). */
  emCiclo: Set<number>;
}

function novoNo(linha: LinhaPessoa, foraDaHierarquia: boolean, gestorForaDoQuadro: boolean): NoPessoa {
  return {
    tipo: "pessoa",
    chave: `p${linha.colaborador_id}`,
    nivel: 0,
    colaborador_id: linha.colaborador_id,
    nome: linha.nome,
    status: linha.status,
    cargo_id: linha.cargo_id,
    cargo_nome: linha.cargo_nome,
    empresa_id: linha.empresa_id,
    empresa_nome: linha.empresa_nome,
    estabelecimento_id: linha.estabelecimento_id,
    unidade: linha.unidade,
    centro_custo_id: linha.centro_custo_id,
    centro_custo: linha.centro_custo,
    diretos: 0,
    total_subarvore: 0,
    gestor_fora_do_quadro: gestorForaDoQuadro,
    fora_da_hierarquia: foraDaHierarquia,
    destacado: false,
    filhos: [],
  };
}

function noDeVaga(linha: LinhaVagaEmAberto, nivel: number): NoVaga {
  return {
    tipo: "vaga",
    chave: `v${linha.vaga_id}`,
    nivel,
    vaga_id: linha.vaga_id,
    titulo: linha.titulo,
    status: linha.status,
    prazo_alvo: linha.prazo_alvo,
    cargo_id: linha.cargo_id,
    cargo_nome: linha.cargo_nome,
    // A requisição de vaga aponta para um estabelecimento (a lotação prevista);
    // registro e centro de custo só existem depois que alguém é admitido nela.
    empresa_id: null,
    empresa_nome: null,
    estabelecimento_id: linha.estabelecimento_id,
    unidade: linha.unidade,
    centro_custo_id: null,
    centro_custo: null,
    destacado: false,
  };
}

/**
 * Acha quem está DENTRO de um laço gestor→liderado, subindo pelos pais.
 *
 * Por que não basta "quem sobrou sem visita é ciclo": num laço A↔B, ninguém do
 * laço é raiz, então a subárvore inteira pendurada nele também fica sem visita.
 * Tratar toda essa sobra como "ciclo" fragmenta o organograma em dezenas de
 * raízes soltas e faz `diretos`/`total_subarvore` MENTIR (o gestor chega a
 * perder liderados da própria contagem). Aqui só o laço é laço: cortamos UMA
 * aresta dele e o resto da árvore continua inteiro e com as contagens certas.
 *
 * Três estados por nó (não visitado / na pilha / pronto) — se subindo chegamos
 * a alguém que está na pilha ATUAL, o trecho da pilha a partir dele é o ciclo.
 */
function detectarCiclos(
  pessoas: LinhaPessoa[],
  paiDe: Map<number, number>
): Set<number> {
  const NA_PILHA = 1;
  const emCiclo = new Set<number>();
  const estado = new Map<number, number>();
  for (const linha of pessoas) {
    const caminho: number[] = [];
    let atual: number | undefined = linha.colaborador_id;
    while (atual !== undefined && !estado.has(atual)) {
      estado.set(atual, NA_PILHA);
      caminho.push(atual);
      atual = paiDe.get(atual);
    }
    if (atual !== undefined && estado.get(atual) === NA_PILHA) {
      for (let i = caminho.indexOf(atual); i < caminho.length; i++) {
        emCiclo.add(caminho[i]);
      }
    }
    for (const id of caminho) estado.set(id, 2);
  }
  return emCiclo;
}

/**
 * Monta a árvore inteira do quadro com DEFESA DE CICLO: cada pessoa é visitada
 * no máximo uma vez (conjunto `visitados`) e a descida para em
 * PROFUNDIDADE_MAXIMA. O laço é identificado com precisão (`detectarCiclos`) e
 * cortado em um ponto determinístico — um membro do laço vira pseudo-raiz e o
 * resto do laço desce como filho dele. Ninguém desaparece, e quem está fora do
 * laço mantém a subárvore e as contagens intactas.
 */
function montarArvore(
  pessoas: LinhaPessoa[],
  vagas: LinhaVagaEmAberto[]
): ArvoreCompleta {
  const linhaPorId = new Map<number, LinhaPessoa>();
  for (const linha of pessoas) {
    linhaPorId.set(linha.colaborador_id, linha);
  }

  const paiDe = new Map<number, number>();
  const filhosDe = new Map<number, number[]>();
  for (const linha of pessoas) {
    const gestorNoQuadro =
      linha.gestor_id !== null && linhaPorId.has(linha.gestor_id);
    if (gestorNoQuadro && linha.gestor_id !== null) {
      paiDe.set(linha.colaborador_id, linha.gestor_id);
      const irmaos = filhosDe.get(linha.gestor_id) ?? [];
      irmaos.push(linha.colaborador_id);
      filhosDe.set(linha.gestor_id, irmaos);
    }
  }

  // Precisa vir ANTES dos nós: quem está no laço nasce já marcado, para a tela
  // acusar todos os envolvidos e não só o ponto onde o laço foi cortado.
  const emCiclo = detectarCiclos(pessoas, paiDe);

  // `paiDe` só ganha entrada quando o gestor vigente está no quadro — logo
  // "tem gestor apontado mas sem pai" É o gestor fora do quadro.
  const porId = new Map<number, NoPessoa>();
  for (const linha of pessoas) {
    porId.set(
      linha.colaborador_id,
      novoNo(
        linha,
        emCiclo.has(linha.colaborador_id),
        linha.gestor_id !== null && !paiDe.has(linha.colaborador_id)
      )
    );
  }

  const visitados = new Set<number>();
  let profundidadeEstourada = false;

  const descer = (id: number, nivel: number): NoPessoa | null => {
    if (visitados.has(id)) return null;
    const no = porId.get(id);
    if (!no) return null;
    visitados.add(id);
    no.nivel = nivel;
    if (nivel >= PROFUNDIDADE_MAXIMA) {
      profundidadeEstourada = true;
      return no;
    }
    const filhos = filhosDe.get(id) ?? [];
    for (const filhoId of filhos) {
      const filho = descer(filhoId, nivel + 1);
      if (filho) no.filhos.push(filho);
    }
    return no;
  };

  // Raiz = quem não tem gestor vigente no quadro (a diretoria) ou cujo gestor
  // vigente saiu do quadro — nesse caso a pessoa sobe, não some.
  const raizes: NoPessoa[] = [];
  for (const linha of pessoas) {
    if (paiDe.has(linha.colaborador_id)) continue;
    const no = descer(linha.colaborador_id, 0);
    if (no) raizes.push(no);
  }
  // Corte do laço: o PRIMEIRO membro de cada ciclo (ordem de nome, portanto
  // estável entre chamadas) vira pseudo-raiz e o resto do laço desce como filho
  // dele — inclusive as subárvores legítimas penduradas no laço, que assim
  // mantêm forma e contagens.
  for (const linha of pessoas) {
    if (!emCiclo.has(linha.colaborador_id)) continue;
    if (visitados.has(linha.colaborador_id)) continue;
    const no = descer(linha.colaborador_id, 0);
    if (no) raizes.push(no);
  }
  // Rede de segurança: sobra só existe se a descida bateu no teto de
  // profundidade. Sobe como raiz marcada — nunca desaparece em silêncio.
  for (const linha of pessoas) {
    if (visitados.has(linha.colaborador_id)) continue;
    const no = descer(linha.colaborador_id, 0);
    if (no) {
      no.fora_da_hierarquia = true;
      raizes.push(no);
    }
  }

  contarSubarvores(raizes);

  // Vagas SÓ depois das contagens: nó fantasma não conta como gente.
  const vagasSemNo: NoVaga[] = [];
  for (const vaga of vagas) {
    const gestor =
      vaga.solicitante_colaborador_id === null
        ? undefined
        : porId.get(vaga.solicitante_colaborador_id);
    if (gestor) {
      gestor.filhos.push(noDeVaga(vaga, gestor.nivel + 1));
    } else {
      vagasSemNo.push(noDeVaga(vaga, 0));
    }
  }

  return { porId, raizes, paiDe, vagasSemNo, profundidadeEstourada, emCiclo };
}

/** Pós-ordem: diretos = filhos pessoa; total = pessoas da subárvore sem a própria. */
function contarSubarvores(nos: NoPessoa[]): number {
  let total = 0;
  for (const no of nos) {
    const filhosPessoa = no.filhos.filter(
      (filho): filho is NoPessoa => filho.tipo === "pessoa"
    );
    no.diretos = filhosPessoa.length;
    no.total_subarvore = contarSubarvores(filhosPessoa);
    total += 1 + no.total_subarvore;
  }
  return total;
}

// ------------------------------------------------------------------ escopo
// Reusa `resolverEscopo` do domínio de colaboradores — fonte ÚNICA do
// "quem vê quem" no sistema. Aqui ele se traduz em:
//   todos   → rh/dp/diretoria/lider_td: a empresa inteira;
//   equipe  → gestor: a PRÓPRIA subárvore (ele e os liderados, recursivo);
//   proprio → funcionário: a corrente dele até a diretoria, e mais nada — não
//             a empresa toda, não os colegas de mesmo nível.

function correnteAteRaiz(
  arvore: ArvoreCompleta,
  colaboradorId: number
): NoPessoa[] {
  const cadeia: NoPessoa[] = [];
  let atual: number | undefined = colaboradorId;
  const vistos = new Set<number>();
  while (atual !== undefined && !vistos.has(atual) && cadeia.length < PROFUNDIDADE_MAXIMA) {
    vistos.add(atual);
    const no = arvore.porId.get(atual);
    if (!no) break;
    cadeia.push(no);
    atual = arvore.paiDe.get(atual);
  }
  return cadeia.reverse();
}

/** Corrente virada em árvore de um filho por nível — sem tocar a árvore real. */
function correnteComoArvore(cadeia: NoPessoa[]): NoPessoa[] {
  if (cadeia.length === 0) return [];
  let filho: NoPessoa | null = null;
  for (let i = cadeia.length - 1; i >= 0; i--) {
    const original = cadeia[i];
    const vagas = original.filhos.filter(
      (no): no is NoVaga => no.tipo === "vaga"
    );
    const filhos: NoOrganograma[] = filho ? [filho, ...vagas] : [...vagas];
    filho = { ...original, nivel: i, filhos };
  }
  return filho ? [filho] : [];
}

function raizesDoEscopo(
  arvore: ArvoreCompleta,
  escopo: Escopo
): { raizes: NoPessoa[]; aviso: string | null } {
  if (escopo.alcance === "todos") {
    return { raizes: arvore.raizes, aviso: null };
  }
  if (escopo.colaboradorId === null) {
    return {
      raizes: [],
      aviso:
        "Seu usuário não está vinculado a um colaborador — não há estrutura para exibir.",
    };
  }
  const meuNo = arvore.porId.get(escopo.colaboradorId);
  if (!meuNo) {
    return {
      raizes: [],
      aviso: "Seu registro de colaborador não está no quadro ativo.",
    };
  }
  if (escopo.alcance === "equipe") {
    return { raizes: [{ ...meuNo, nivel: 0 }], aviso: null };
  }
  return {
    raizes: correnteComoArvore(correnteAteRaiz(arvore, escopo.colaboradorId)),
    aviso: null,
  };
}

// ------------------------------------------------------------------ filtro e busca

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface Criterios {
  /** Os TRÊS da 0047 — independentes entre si e combináveis. */
  empresaId: number | null;
  estabelecimentoId: number | null;
  centroCustoId: number | null;
  cargoId: number | null;
  busca: string | null;
}

function casaCriterios(no: NoOrganograma, criterios: Criterios): boolean {
  if (criterios.empresaId !== null && no.empresa_id !== criterios.empresaId) {
    return false;
  }
  if (
    criterios.estabelecimentoId !== null &&
    no.estabelecimento_id !== criterios.estabelecimentoId
  ) {
    return false;
  }
  if (
    criterios.centroCustoId !== null &&
    no.centro_custo_id !== criterios.centroCustoId
  ) {
    return false;
  }
  if (criterios.cargoId !== null && no.cargo_id !== criterios.cargoId) {
    return false;
  }
  if (criterios.busca !== null) {
    const alvo = no.tipo === "pessoa" ? no.nome : no.titulo;
    if (!semAcento(alvo).includes(criterios.busca)) return false;
  }
  return true;
}

/**
 * Copia a árvore aplicando filtro/busca: mantém o nó que casa E todos os
 * ancestrais dele (senão a estrutura quebra e ninguém entende onde a pessoa
 * está). `destacado` marca quem casou — a tela abre o caminho e realça.
 * As contagens (diretos/total_subarvore) vêm do quadro COMPLETO de propósito:
 * filtro não pode fazer o organograma mentir sobre o tamanho da equipe.
 */
function podar(
  nos: NoOrganograma[],
  criterios: Criterios,
  temCriterio: boolean,
  nivel: number,
  contador: { destacados: number }
): NoOrganograma[] {
  const resultado: NoOrganograma[] = [];
  for (const no of nos) {
    const casou = temCriterio ? casaCriterios(no, criterios) : false;
    const filhos =
      no.tipo === "pessoa"
        ? podar(no.filhos, criterios, temCriterio, nivel + 1, contador)
        : [];
    if (temCriterio && !casou && filhos.length === 0) continue;
    if (casou) contador.destacados += 1;
    resultado.push(
      no.tipo === "pessoa"
        ? { ...no, nivel, destacado: casou, filhos }
        : { ...no, nivel, destacado: casou }
    );
  }
  return resultado;
}

// ------------------------------------------------------------------ avisos e headcount

function percorrer(nos: NoOrganograma[], visitar: (no: NoOrganograma) => void): void {
  for (const no of nos) {
    visitar(no);
    if (no.tipo === "pessoa") percorrer(no.filhos, visitar);
  }
}

function calcularHeadcount(raizes: NoPessoa[]): HeadcountOrganograma {
  let realizado = 0;
  let vagas = 0;
  percorrer(raizes, (no) => {
    if (no.tipo === "pessoa") realizado += 1;
    else vagas += 1;
  });
  return {
    realizado,
    aprovado: realizado + vagas,
    vagas_em_aberto: vagas,
    lacuna: vagas,
  };
}

// ------------------------------------------------------------------ serviço

export async function montarOrganograma(
  sessao: PayloadSessao,
  consulta: ConsultaOrganograma
): Promise<Organograma> {
  const escopo = await resolverEscopo(sessao);
  const [pessoas, vagas, estruturaOpcoes, cargos] = await Promise.all([
    listarPessoasDoQuadro(),
    listarVagasEmAberto(),
    listarOpcoesDeFiltroEstrutura(),
    listarCargos(),
  ]);

  const arvore = montarArvore(pessoas, vagas);
  const { raizes: raizesEscopo, aviso: avisoEscopo } = raizesDoEscopo(
    arvore,
    escopo
  );

  const avisos: string[] = [];
  if (avisoEscopo) avisos.push(avisoEscopo);

  // Headcount é do RECORTE VISÍVEL e ignora filtro/busca (senão o número muda
  // a cada digitação). Para a corrente do funcionário não existe "quadro" —
  // 3 pessoas em linha não são um quadro; o bloco não aparece.
  const headcount =
    escopo.alcance === "proprio" || raizesEscopo.length === 0
      ? null
      : calcularHeadcount(raizesEscopo);

  // Ciclo e teto de profundidade são problemas DIFERENTES e o aviso diz qual é:
  // o antigo texto único acusava "ciclo" para toda pessoa pendurada na raiz e
  // inflava o número (um laço de 2 virava aviso de 21 pessoas).
  let emCicloVisivel = 0;
  let cortadoPorProfundidade = 0;
  let gestorForaDoQuadro = 0;
  percorrer(raizesEscopo, (no) => {
    if (no.tipo !== "pessoa") return;
    if (arvore.emCiclo.has(no.colaborador_id)) emCicloVisivel += 1;
    else if (no.fora_da_hierarquia) cortadoPorProfundidade += 1;
    if (no.gestor_fora_do_quadro) gestorForaDoQuadro += 1;
  });
  if (emCicloVisivel > 0) {
    avisos.push(
      `${emCicloVisivel} pessoa(s) em ciclo na relação gestor→liderado vigente ` +
        `(A lidera B e B lidera A, direta ou indiretamente). O laço foi cortado em um ponto ` +
        `para a árvore poder ser desenhada e quem está nele aparece marcado — ` +
        `corrija em rh.relacao_gestor (tela de colaboradores).`
    );
  }
  if (cortadoPorProfundidade > 0) {
    avisos.push(
      `${cortadoPorProfundidade} pessoa(s) penduradas na raiz porque a descida na ` +
        `hierarquia foi interrompida antes de chegar nelas. Confira rh.relacao_gestor.`
    );
  }
  if (gestorForaDoQuadro > 0) {
    avisos.push(
      `${gestorForaDoQuadro} pessoa(s) com gestor vigente fora do quadro (desligado, por exemplo). ` +
        `Subiram para a raiz até o DP registrar o novo gestor.`
    );
  }
  if (arvore.profundidadeEstourada) {
    avisos.push(
      `Hierarquia mais profunda que ${PROFUNDIDADE_MAXIMA} níveis: a descida foi interrompida por segurança.`
    );
  }
  if (escopo.alcance === "todos" && arvore.vagasSemNo.length > 0) {
    avisos.push(
      `${arvore.vagasSemNo.length} vaga(s) em aberto sem gestor identificado (o solicitante da requisição não é colaborador do quadro).`
    );
  }

  const criterios: Criterios = {
    empresaId: consulta.empresa_id ?? null,
    estabelecimentoId: consulta.estabelecimento_id ?? null,
    centroCustoId: consulta.centro_custo_id ?? null,
    cargoId: consulta.cargo_id ?? null,
    busca: consulta.busca ? semAcento(consulta.busca) : null,
  };
  const temCriterio =
    criterios.empresaId !== null ||
    criterios.estabelecimentoId !== null ||
    criterios.centroCustoId !== null ||
    criterios.cargoId !== null ||
    criterios.busca !== null;
  const contador = { destacados: 0 };
  const raizes = podar(raizesEscopo, criterios, temCriterio, 0, contador).filter(
    (no): no is NoPessoa => no.tipo === "pessoa"
  );

  return {
    alcance: escopo.alcance,
    raizes,
    // Vaga órfã só para quem vê a empresa toda — é achado de DP/RH, não de gestor.
    vagas_sem_no: escopo.alcance === "todos" ? arvore.vagasSemNo : [],
    headcount,
    estrutura_opcoes: estruturaOpcoes,
    cargos,
    destacados: contador.destacados,
    avisos,
  };
}

// A guarda local `exigirSessaoCompleta` foi APAGADA (A6): ela era uma cópia
// de exigirSessaoValida SEM a reconferência de usuário ativo — um desativado
// lia a hierarquia inteira por até 8h de JWT. A rota usa exigirSessao (lib/
// sessao), que reconfere `usuario.ativo` no banco a cada leitura — e, por
// herdar exigirSessaoValida, também barra pendente_2fa e ciencia_pendente
// (A8). Guarda de sessão não se copia: mora num lugar só.
