export type StatusOutbox = 'pendente' | 'enviando' | 'erro' | 'enviado'

export interface OutboxItem<TPayload = unknown> {
  id: string
  tipo: string
  payload: TPayload
  status: StatusOutbox
  permanente: boolean
  tentativas: number
  erroMsg: string | null
  criadoEm: string
  atualizadoEm: string
}

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; retentavel: boolean; mensagem: string }

/**
 * Contrato que cada módulo (nova solicitação, checklist, e o que vier
 * depois) implementa e registra em handlerRegistry.ts. O syncEngine não
 * conhece nada sobre o formato de nenhum payload específico -- só sabe
 * despachar por `tipo` e chamar `enviar`.
 */
export interface ContextoEnvio<TPayload> {
  /** Id do próprio item da fila -- dobra como origem_local_id nas tabelas
   *  reais (frota_aprovacoes.origem_local_id / frota_checklists.origem_local_id),
   *  garantindo que reenviar o mesmo item nunca duplica o registro. */
  itemId: string
  atualizarPayload: (parcial: Partial<TPayload>) => Promise<void>
}

export interface OutboxHandler<TPayload = unknown> {
  tipo: string
  enviar(payload: TPayload, ctx: ContextoEnvio<TPayload>): Promise<ResultadoEnvio>
}
