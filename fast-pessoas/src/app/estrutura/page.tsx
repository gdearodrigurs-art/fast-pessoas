import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelEstrutura } from "./painel-estrutura";

/**
 * Estrutura do grupo: os três catálogos por trás dos três campos que o dono
 * separou — REGISTRO (empresa do grupo), LOTAÇÃO (local de trabalho) e CENTRO
 * DE CUSTO. Cada um com sua chave; a tela mostra só o que a chave abre e a API
 * reconfere. Nada aqui é chumbado: tudo se cria, se renomeia por vigência e se
 * inativa sem chamar dev.
 */
export default async function PaginaEstrutura() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{
    pode_empresa: boolean;
    pode_centro_custo: boolean;
    pode_lotacao: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rh.empresa.administrar')      AS pode_empresa,
            sistema.tem_permissao($1, 'rh.centro_custo.administrar') AS pode_centro_custo,
            sistema.tem_permissao($1, 'rh.estabelecimento.administrar')
              AS pode_lotacao`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];
  if (!pode?.pode_empresa && !pode?.pode_centro_custo && !pode?.pode_lotacao) {
    redirect("/");
  }
  return (
    <PainelEstrutura
      podeEmpresa={Boolean(pode?.pode_empresa)}
      podeCentroCusto={Boolean(pode?.pode_centro_custo)}
      podeLotacao={Boolean(pode?.pode_lotacao)}
    />
  );
}
