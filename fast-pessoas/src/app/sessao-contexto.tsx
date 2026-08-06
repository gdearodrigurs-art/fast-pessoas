"use client";

import { createContext, useContext } from "react";

/**
 * Quem está logado, para a TELA — nome e papel, nada além.
 *
 * Existe porque o cabeçalho é usado em 41 lugares e **40 deles são client
 * component**: passar a sessão por prop obrigaria a alterar cada página
 * servidora E cada componente cliente, uns 80 arquivos. O layout raiz lê a
 * sessão uma vez e a deposita aqui.
 *
 * O que trafega é só o que a pessoa já vê na própria tela. `usuario_id` e o
 * estado do 2FA ficam no servidor — decisão de acesso continua sendo por chave
 * de permissão, no servidor, dentro da consulta. Isto aqui é enfeite de
 * cabeçalho, e nada mais pode se apoiar nele.
 */
export interface IdentidadeNaTela {
  nome: string;
  papel: string;
}

const ContextoSessao = createContext<IdentidadeNaTela | null>(null);

export function ProvedorSessao({
  identidade,
  children,
}: {
  identidade: IdentidadeNaTela | null;
  children: React.ReactNode;
}) {
  return (
    <ContextoSessao.Provider value={identidade}>
      {children}
    </ContextoSessao.Provider>
  );
}

/** `null` fora de sessão — a tela de entrada também passa por aqui. */
export function useIdentidade(): IdentidadeNaTela | null {
  return useContext(ContextoSessao);
}
