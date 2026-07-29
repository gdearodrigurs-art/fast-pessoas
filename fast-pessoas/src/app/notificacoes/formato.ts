// Exibição sempre em America/Sao_Paulo (banco guarda UTC).
const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const FORMATO_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function dataHoraSp(iso: string): string {
  return FORMATO_DATA_HORA.format(new Date(iso));
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias"; acima de 7 dias, a data. */
export function tempoRelativo(iso: string, agoraMs = Date.now()): string {
  const emMs = new Date(iso).getTime();
  const segundos = Math.max(0, Math.floor((agoraMs - emMs) / 1000));
  if (segundos < 60) return "agora";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return FORMATO_DATA.format(new Date(iso));
}

export interface NotificacaoExibida {
  id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criada_em: string;
}

export interface RespostaNotificacoes {
  nao_lidas: number;
  tem_mais: boolean;
  notificacoes: NotificacaoExibida[];
}
