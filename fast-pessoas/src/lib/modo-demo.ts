// Modo demonstração — a vitrine pública do sistema (branch demo-publica).
//
// Liga SÓ com MODO_DEMO=1 no ambiente do deploy de apresentação. Com ele
// ligado, a tela /entrar mostra um botão por persona fictícia e a pessoa entra
// sem senha e sem 2FA; a revalidação de TOTP no ato (aprovar folha) aceita
// qualquer código de 6 dígitos.
//
// A porta só abre para contas do domínio fictício @fastdemo.local — a conta
// real de administrador e qualquer outra seguem pelo login normal. Nunca ligar
// esta variável num banco com gente de verdade.

export const DOMINIO_DEMO = "@fastdemo.local";

export function modoDemoLigado(): boolean {
  return process.env.MODO_DEMO === "1";
}

export function ehContaDemo(email: string): boolean {
  return email.toLowerCase().endsWith(DOMINIO_DEMO);
}

export type PersonaDemo = {
  email: string;
  papel: string;
  titulo: string;
  descricao: string;
};

// As personas de db/semear-demo.js, na ordem em que fazem sentido para quem
// conhece o sistema pela primeira vez.
export const PERSONAS_DEMO: PersonaDemo[] = [
  {
    email: "diretora.pessoas@fastdemo.local",
    papel: "diretoria",
    titulo: "Diretoria — Helena",
    descricao: "Visão da rede inteira: painel executivo, custo de pessoal, clima.",
  },
  {
    email: "dp@fastdemo.local",
    papel: "dp",
    titulo: "Departamento Pessoal — Patrícia",
    descricao: "Folha, férias, admissão, desligamento, benefícios e ponto.",
  },
  {
    email: "rh@fastdemo.local",
    papel: "rh",
    titulo: "RH — Rafael",
    descricao: "Avaliação 360, PDI, pesquisas de clima, documentos e relatórios.",
  },
  {
    email: "gestor@fastdemo.local",
    papel: "gestor",
    titulo: "Gestor de loja — Marcos",
    descricao: "Portal do gestor: só a própria equipe, aprovações e avaliações.",
  },
  {
    email: "funcionario@fastdemo.local",
    papel: "funcionario",
    titulo: "Colaboradora — Juliana",
    descricao: "Portal do colaborador: holerite, férias, ponto, PDI e documentos.",
  },
  {
    email: "recrutador@fastdemo.local",
    papel: "recrutador",
    titulo: "Recrutamento — Solange",
    descricao: "Vagas, candidatos e seleção, sem enxergar salário nem saúde.",
  },
  {
    email: "lidertd@fastdemo.local",
    papel: "lider_td",
    titulo: "Treinamento e desenvolvimento — Rogério",
    descricao: "Estrutura, avaliações e desenvolvimento do quadro.",
  },
];
