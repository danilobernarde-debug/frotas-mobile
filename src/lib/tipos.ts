/**
 * Tipos que espelham o banco -- mesma convenção do frotas-web
 * (src/lib/tipos.ts): nomes de campo em snake_case iguais ao Postgres,
 * sem camelCase no meio do caminho. Só o subconjunto que o app do
 * encarregado realmente usa (não é o schema inteiro).
 */

export type PapelUsuario = 'ADMIN' | 'GESTOR' | 'CONSULTA' | 'ENCARREGADO'

export interface Perfil {
  id: string
  nome: string
  email: string
  papel: PapelUsuario
  regional_id: number | null
  ativo: boolean
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

export type TipoAnexo = 'PROBLEMA' | 'ORCAMENTO' | 'NOTA FISCAL' | 'OUTRO' | 'BOMBA' | 'PLACA' | 'KM'

export interface Aprovacao {
  id: number
  data: string
  veiculo_id: number | null
  regional_id: number | null
  servico: string
  valor: number
  justificativa: string | null
  categoria: CategoriaSolicitacao | null
  status: StatusAprovacao
  solicitante_id: string | null
  origem_local_id: string | null
  criado_em: string
  veiculo?: Pick<Veiculo, 'id' | 'placa' | 'modelo'> | null
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

export interface Mensagem {
  id: number
  encarregado_id: string | null
  autor_id: string | null
  regional_id: number | null
  texto: string
  origem_local_id: string | null
  criado_em: string
  autor?: Pick<Perfil, 'id' | 'nome'> | null
}
