import type { OutboxItem } from '../../outbox/types'
import type { Aprovacao } from '../../lib/tipos'
import type { NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'

export type EntradaChat =
  | { fonte: 'servidor'; id: string; criadoEm: string; aprovacao: Aprovacao }
  | { fonte: 'local'; id: string; criadoEm: string; item: OutboxItem<NovaSolicitacaoPayload> }
