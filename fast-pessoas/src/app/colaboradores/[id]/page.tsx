import { redirect } from "next/navigation";
import { colaboradorNoEscopo } from "@/dominios/colaboradores/repositorio";
import { escopoDaMinhaEquipe } from "@/dominios/colaboradores/servico";
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
  podeVerDisciplinar: boolean;
  podeRegistrarDisciplinar: boolean;
  podeVerPosse: boolean;
  podeRegistrarPosse: boolean;
  /** A ficha aberta é a do PRÓPRIO usuário da sessão (rh.vinculo_atual). Só
   *  de render: decide se o botão de ciência de posse aparece — a ciência é
   *  ato do titular, e o serviço reconfere (não-titular = 404). */
  ehPropriaFicha: boolean;
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
    pode_ver_salario_equipe: boolean;
    pode_editar_posicao: boolean;
    pode_ver_restrita: boolean;
    pode_registrar_ocorrencia: boolean;
    pode_registrar_feedback: boolean;
    pode_admin_gestor: boolean;
    pode_admin_lotacao: boolean;
    pode_admin_cargo: boolean;
    pode_ver_disciplinar: boolean;
    pode_registrar_disciplinar: boolean;
    pode_ver_posse: boolean;
    pode_registrar_posse: boolean;
    eh_propria_ficha: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rh.colaborador.editar')      AS pode_editar,
            sistema.tem_permissao($1, 'rh.posicao.ver')             AS pode_ver_salario,
            sistema.tem_permissao($1, 'rh.posicao.ver.equipe')      AS pode_ver_salario_equipe,
            sistema.tem_permissao($1, 'rh.posicao.editar')          AS pode_editar_posicao,
            sistema.tem_permissao($1, 'rh.ocorrencia.restrita.ver') AS pode_ver_restrita,
            sistema.tem_permissao($1, 'rh.ocorrencia.registrar')    AS pode_registrar_ocorrencia,
            sistema.tem_permissao($1, 'rh.feedback.registrar')      AS pode_registrar_feedback,
            sistema.tem_permissao($1, 'rh.gestor.administrar')      AS pode_admin_gestor,
            sistema.tem_permissao($1, 'rh.estabelecimento.administrar') AS pode_admin_lotacao,
            sistema.tem_permissao($1, 'rh.cargo.administrar')       AS pode_admin_cargo,
            sistema.tem_permissao($1, 'rh.disciplinar.ver')         AS pode_ver_disciplinar,
            sistema.tem_permissao($1, 'rh.disciplinar.registrar')   AS pode_registrar_disciplinar,
            sistema.tem_permissao($1, 'rh.posse.ver')               AS pode_ver_posse,
            sistema.tem_permissao($1, 'rh.posse.registrar')         AS pode_registrar_posse,
            rh.vinculo_atual($1) = $2::bigint                       AS eh_propria_ficha`,
    [sessao.usuario_id, idNumero]
  );
  const linha = linhas[0];
  // A1:a — o salário aparece também para quem só tem a chave de EQUIPE, desde
  // que a ficha aberta esteja na sub-árvore de quem olha (ou seja um vínculo
  // dele). Flag só de render: a rota /posicao reconfere chave e alcance.
  let salarioPelaEquipe = false;
  if (!linha?.pode_ver_salario && linha?.pode_ver_salario_equipe) {
    salarioPelaEquipe = await colaboradorNoEscopo(
      idNumero,
      await escopoDaMinhaEquipe(sessao)
    );
  }
  const permissoes: PermissoesFicha = {
    podeEditar: Boolean(linha?.pode_editar),
    podeVerSalario: Boolean(linha?.pode_ver_salario) || salarioPelaEquipe,
    podeEditarPosicao: Boolean(linha?.pode_editar_posicao),
    podeVerRestrita: Boolean(linha?.pode_ver_restrita),
    podeRegistrarOcorrencia: Boolean(linha?.pode_registrar_ocorrencia),
    podeRegistrarFeedback: Boolean(linha?.pode_registrar_feedback),
    podeAdminGestor: Boolean(linha?.pode_admin_gestor),
    podeAdminLotacao: Boolean(linha?.pode_admin_lotacao),
    podeAdminCargo: Boolean(linha?.pode_admin_cargo),
    podeVerDisciplinar: Boolean(linha?.pode_ver_disciplinar),
    podeRegistrarDisciplinar: Boolean(linha?.pode_registrar_disciplinar),
    podeVerPosse: Boolean(linha?.pode_ver_posse),
    podeRegistrarPosse: Boolean(linha?.pode_registrar_posse),
    ehPropriaFicha: Boolean(linha?.eh_propria_ficha),
  };
  return <FichaColaborador colaboradorId={idNumero} permissoes={permissoes} />;
}
