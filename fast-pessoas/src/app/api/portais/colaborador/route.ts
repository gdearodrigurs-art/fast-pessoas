import {
  exigirSessaoDoPortal,
  montarPortal,
} from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";

/**
 * Portal do colaborador — visão única do PRÓPRIO colaborador.
 *
 * Guarda: sessão autenticada e com 2FA concluído, sem chave especial
 * (`exigirSessaoDoPortal` espelha `exigirPermissao` menos a chave). O portal
 * não tem chave porque não tem alcance: o recurso é o próprio usuário. Cada
 * bloco do payload, esse sim, respeita a chave do seu domínio — o serviço
 * confere `ferias.programar`, `demanda.criar`, `adesao.solicitar`,
 * `documento.ver` e `clima.responder` e devolve `null` no bloco que a sessão
 * não alcança.
 *
 * DEFESA CONTRA IDOR: esta rota NÃO lê nada da requisição — sem query string,
 * sem corpo, sem segmento dinâmico. O colaborador alvo é sempre
 * `colaboradorIdDoUsuario(sessao.usuario_id)`, resolvido no serviço. Não
 * aceitar id não é uma validação que pode falhar: é a ausência do parâmetro.
 */
export async function GET() {
  try {
    const sessao = await exigirSessaoDoPortal();
    return Response.json(await montarPortal(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}
