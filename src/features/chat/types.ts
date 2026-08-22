import type { OutboxItem } from '../../outbox/types'
import type { Aprovacao, Mensagem } from '../../lib/tipos'
import type { MensagemPayload } from '../../outbox/handlers/mensagem'
import type { NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'

export type EntradaChat =
  | { fonte: 'servidor'; tipo: 'solicitacao'; id: string; criadoEm: string; aprovacao: Aprovacao }
  | { fonte: 'local'; tipo: 'solicitacao'; id: string; criadoEm: string; item: OutboxItem<NovaSolicitacaoPayload> }
  | { fonte: 'servidor'; tipo: 'mensagem'; id: string; criadoEm: string; mensagem: Mensagem }
  | { fonte: 'local'; tipo: 'mensagem'; id: string; criadoEm: string; item: OutboxItem<MensagemPayload> }
