import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { FichaColaborador } from "./ficha-colaborador";

export interface PermissoesFicha {
  podeEditar: boolean;
  podeVerSalario: boolean;
  podeEditarPosicao: boolean;
  podeVerRestrita: boolean;
  podeRegistrarOcorrencia: boolean;
  podeRegistrarFeedback: boolean;
  podeAdminGestor: boolean;
  podeAdminLotacao: boolean;
  podeAdminCargo: boolean;
}

export default async function PaginaFichaColaborador({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/colaboradores");
  }
  // Flags só de RENDERIZAÇÃO: a API reconfere cada chave em toda chamada e o
  // dado sensível nem sai do backend para quem não pode ver.
  const linhas = await consultar<{
    pode_editar: boolean;
    pode_ver_salario: boolean;
    pode_editar_posicao: boolean;
    pode_ver_restrita: boolean;
    pode_registrar_ocorrencia: boolean;
    pode_registrar_feedback: boolean;
    pode_admin_gestor: boolean;
    pode_admin_lotacao: boolean;
    pode_admin_cargo: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rh.colaborador.editar')      AS pode_editar,
            sistema.tem_permissao($1, 'rh.posicao.ver')             AS pode_ver_salario,
            sistema.tem_permissao($1, 'rh.posicao.editar')          AS pode_editar_posicao,
            sistema.tem_permissao($1, 'rh.ocorrencia.restrita.ver') AS pode_ver_restrita,
            sistema.tem_permissao($1, 'rh.ocorrencia.registrar')    AS pode_registrar_ocorrencia,
            sistema.tem_permissao($1, 'rh.feedback.registrar')      AS pode_registrar_feedback,
            sistema.tem_permissao($1, 'rh.gestor.administrar')      AS pode_admin_gestor,
            sistema.tem_permissao($1, 'rh.estabelecimento.administrar') AS pode_admin_lotacao,
            sistema.tem_permissao($1, 'rh.cargo.administrar')       AS pode_admin_cargo`,
    [sessao.usuario_id]
  );
  const linha = linhas[0];
  const permissoes: PermissoesFicha = {
    podeEditar: Boolean(linha?.pode_editar),
    podeVerSalario: Boolean(linha?.pode_ver_salario),
    podeEditarPosicao: Boolean(linha?.pode_editar_posicao),
    podeVerRestrita: Boolean(linha?.pode_ver_restrita),
    podeRegistrarOcorrencia: Boolean(linha?.pode_registrar_ocorrencia),
    podeRegistrarFeedback: Boolean(linha?.pode_registrar_feedback),
    podeAdminGestor: Boolean(linha?.pode_admin_gestor),
    podeAdminLotacao: Boolean(linha?.pode_admin_lotacao),
    podeAdminCargo: Boolean(linha?.pode_admin_cargo),
  };
  return <FichaColaborador colaboradorId={idNumero} permissoes={permissoes} />;
}
