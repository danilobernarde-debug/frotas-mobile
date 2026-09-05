/**
 * Tipos que espelham o banco -- mesma convenção do frotas-web
 * (src/lib/tipos.ts): nomes de campo em snake_case iguais ao Postgres,
 * sem camelCase no meio do caminho. Só o subconjunto que o app do
 * encarregado realmente usa (não é o schema inteiro).
 */

export type PapelUsuario = 'ADMIN' | 'GESTOR' | 'CONSULTA' | 'MOTORISTA'

export interface Perfil {
  id: string
  nome: string
  email: string
  papel: PapelUsuario
  regional_id: number | null
  motorista_id: number | null
  ativo: boolean
  /** Nome do motorista vinculado (motorista_id) -- preenchido à parte no
   *  AuthProvider, não vem do `select('*')` de frota_perfis. */
  motoristaNome?: string | null
}

export interface Veiculo {
  id: number
  placa: string
  modelo: string
  regional_id: number | null
  km_atual: number
}

export type CategoriaSolicitacao = 'ABASTECIMENTO' | 'MANUTENÇÃO' | 'OUTRO'

export type StatusAprovacao = 'PENDENTE' | 'APROVADO' | 'REPROVADO'

/** Mesmo enum frota_status_pagamento do banco (0001_schema.sql). Só
 *  ADMIN muda (trg_aprovacoes_aa_permissao). */
export type StatusPagamento = 'NÃO SE APLICA' | 'AGD PAGAMENTO' | 'PAGO'

export type TipoAnexo =
  | 'PROBLEMA' | 'ORCAMENTO' | 'NOTA FISCAL' | 'OUTRO'
  | 'BOMBA' | 'PLACA' | 'KM'
  // Ciclo de pagamento (migration 0036 do frotas-web): PIX é a foto da
  // chave/QR de quem recebe (tirada junto com a solicitação),
  // COMPROVANTE é o comprovante do pagamento anexado depois pelo
  // gestor/admin, e 'NOTA FISCAL' fecha o ciclo (motorista anexa a nota).
  | 'PIX' | 'COMPROVANTE'

/** Mesmo enum frota_tipo_combustivel do banco (0001_schema.sql). */
export const TIPOS_COMBUSTIVEL = ['GASOLINA', 'ALCOOL', 'DIESEL', 'DIESEL S10', 'ARLA 32', 'GNV'] as const
export type TipoCombustivel = (typeof TIPOS_COMBUSTIVEL)[number]

export interface Aprovacao {
  id: number
  data: string
  veiculo_id: number | null
  regional_id: number | null
  servico: string
  valor: number
  odometro: number | null
  litros: number | null
  preco_litro: number | null
  tipo_combustivel: TipoCombustivel | null
  justificativa: string | null
  categoria: CategoriaSolicitacao | null
  /** Chave PIX de quem recebe, digitada pelo motorista na criação
   *  (migration 0037 do frotas-web). Nula em solicitação antiga. */
  chave_pix: string | null
  status: StatusAprovacao
  status_pagamento: StatusPagamento
  solicitante_id: string | null
  origem_local_id: string | null
  criado_em: string
  atualizado_em: string
  veiculo?: Pick<Veiculo, 'id' | 'placa' | 'modelo'> | null
  /** Só os TIPOS dos anexos, sem caminho nem legenda -- é o bastante pro
   *  card do chat dizer que o comprovante chegou, sem puxar o peso da
   *  lista inteira em toda sincronização. */
  anexos?: { tipo: TipoAnexo }[] | null
}

export interface AnexoAprovacao {
  id: number
  aprovacao_id: number
  tipo: TipoAnexo
  caminho: string
  legenda: string | null
  criado_em: string
}

export interface ItemChecklistModelo {
  id: number
  ordem: number
  descricao: string
  ativo: boolean
}

export interface Checklist {
  id: number
  veiculo_id: number
  motorista_id: number | null
  data_hora: string
  odometro: number | null
  regional_id: number | null
  criado_por: string | null
  origem_local_id: string | null
  criado_em: string
  veiculo?: Pick<Veiculo, 'id' | 'placa' | 'modelo'> | null
}

export interface RespostaChecklist {
  id: number
  checklist_id: number
  item_id: number
  conforme: boolean | null
  observacao: string | null
}

export type CategoriaAnexoMensagem = 'IMAGEM' | 'AUDIO' | 'DOCUMENTO' | 'VIDEO' | 'LOCALIZACAO'
/** LOCALIZACAO nunca sobe arquivo -- só coordenada (ver migration 0031 em
 *  frotas-web). */
export type CategoriaAnexoUpload = Exclude<CategoriaAnexoMensagem, 'LOCALIZACAO'>

export interface Mensagem {
  id: number
  encarregado_id: string | null
  autor_id: string | null
  regional_id: number | null
  texto: string | null
  origem_local_id: string | null
  respondendo_a: number | null
  respondendo_aprovacao_id: number | null
  criado_em: string
  autor?: Pick<Perfil, 'id' | 'nome'> | null
  anexo_caminho: string | null
  anexo_tipo: CategoriaAnexoMensagem | null
  anexo_mime: string | null
  anexo_nome: string | null
  anexo_tamanho: number | null
  anexo_duracao_segundos: number | null
  anexo_latitude: number | null
  anexo_longitude: number | null
  anexo_precisao: number | null
}
