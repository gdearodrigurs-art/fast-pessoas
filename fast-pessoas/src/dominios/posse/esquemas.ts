import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// ===========================================================================
// Domínio POSSE de patrimônio (migration 0081). Registrar que um colaborador
// recebeu e detém um ativo da empresa (notebook, ferramenta, carro), com
// aceite eletrônico — ciência por hash sobre o termo no GED (molde EPI/0014) —
// e devolução conferida no desligamento (eixo 10).
//
// O catálogo NÃO é novo: a categoria vem de rh.categoria_devolucao (0054), o
// mesmo vocabulário do checklist de devolução do desligamento, administrável
// pela chave desligamento.categoria.administrar. O zod valida só a FORMA da
// chave; se ela existe e está ATIVA é o serviço quem confere no catálogo (e o
// trigger da 0081 garante no banco).
//
// O termo no GED é OPCIONAL na entrega; a CIÊNCIA exige termo (CHECK da 0081:
// NOT ciencia_registrada OR termo_documento_id IS NOT NULL).
// ===========================================================================

// O mesmo formato que o banco impõe em rh.categoria_devolucao.chave.
const FORMATO_CHAVE = /^[a-z][a-z0-9_]*$/;

export const esquemaRegistroPosse = z.object({
  categoria_chave: z
    .string()
    .trim()
    .min(1, "Escolha a categoria do item")
    .max(60)
    .regex(FORMATO_CHAVE, "Categoria inválida"),
  // O que é ("Notebook Dell i7", "Furadeira Bosch"); a categoria é o balde.
  descricao: z.string().trim().min(3, "Descreva o item").max(500),
  quantidade: z
    .number("Informe a quantidade")
    .int("Quantidade inválida")
    .min(1, "Quantidade mínima: 1")
    .max(999, "Quantidade máxima: 999"),
  // Nº de série / patrimônio, opcional.
  numero_serie: z.string().trim().max(120).optional(),
  data_entrega: esquemaData,
  // Termo de entrega no GED — a ciência do colaborador é dada sobre ele.
  termo_documento_id: z
    .number("Documento inválido")
    .int("Documento inválido")
    .positive("Documento inválido")
    .nullish(),
});

export type RegistroPosse = z.infer<typeof esquemaRegistroPosse>;

/**
 * A devolução e a ciência não carregam dados do cliente: o momento é o do
 * servidor (now(), e o hash do termo é lido do GED na hora). Os esquemas
 * existem para a rota validar a FORMA da requisição — corpo vazio ou objeto
 * sem campos; qualquer campo extra é ignorado, nunca gravado.
 */
export const esquemaDevolucao = z.object({});

export type Devolucao = z.infer<typeof esquemaDevolucao>;

export const esquemaCiencia = z.object({});

export type Ciencia = z.infer<typeof esquemaCiencia>;
