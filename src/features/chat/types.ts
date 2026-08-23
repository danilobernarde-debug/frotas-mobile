import type { OutboxItem } from '../../outbox/types'
import type { Aprovacao, Mensagem } from '../../lib/tipos'
import type { MensagemPayload } from '../../outbox/handlers/mensagem'
import type { NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'

export type EntradaChatReal =
  | { fonte: 'servidor'; tipo: 'solicitacao'; id: string; criadoEm: string; aprovacao: Aprovacao }
  | { fonte: 'local'; tipo: 'solicitacao'; id: string; criadoEm: string; item: OutboxItem<NovaSolicitacaoPayload> }
  | { fonte: 'servidor'; tipo: 'mensagem'; id: string; criadoEm: string; mensagem: Mensagem }
  | { fonte: 'local'; tipo: 'mensagem'; id: string; criadoEm: string; item: OutboxItem<MensagemPayload> }

/** Separador visual (data, ou "Mensagens não lidas") -- inserido só no
 *  cliente (ver divisoresData.ts / useDivisorNaoLidas.ts), nunca vem do
 *  servidor nem da fila local. */
export type EntradaChatDivisor = { tipo: 'divisor'; id: string; rotulo: string }

export type EntradaChat = EntradaChatReal | EntradaChatDivisor
