import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelCargos } from "./painel-cargos";

export default async function PaginaCargos() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Dois níveis (migration 0019): `administrar` cria versão e vê faixa salarial;
  // `ver` só lê o descritivo/RCF (recrutador e líder de T&D — quem escreve a
  // vaga precisa do RCF, não da remuneração). Flags só de renderização: a API
  // reconfere a chave e a faixa não sai do backend para quem só lê.
  const linhas = await consultar<{
    pode_admin_cargo: boolean;
    pode_ver_cargo: boolean;
    pode_admin_estrutura: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rh.cargo.administrar') AS pode_admin_cargo,
            sistema.tem_permissao($1, 'rh.cargo.ver')         AS pode_ver_cargo,
            sistema.tem_permissao($1, 'rh.estabelecimento.administrar')
              AS pode_admin_estrutura`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];
  if (!pode?.pode_admin_cargo && !pode?.pode_ver_cargo) {
    redirect("/");
  }
  return (
    <PainelCargos
      podeAdministrar={Boolean(pode?.pode_admin_cargo)}
      podeAdminEstrutura={Boolean(pode?.pode_admin_estrutura)}
    />
  );
}
