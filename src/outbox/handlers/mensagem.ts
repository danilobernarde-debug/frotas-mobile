import { classificarErroSupabase, VIOLACAO_UNICIDADE } from '../../lib/erroSupabase'
import { supabase } from '../../lib/supabase'
import { registrarHandler } from '../handlerRegistry'
import type { ContextoEnvio, ResultadoEnvio } from '../types'

export interface MensagemPayload {
  texto: string
  /** Id (do servidor) da mensagem sendo respondida, estilo WhatsApp.
   *  Só mensagens já sincronizadas têm esse id -- não dá pra responder
   *  uma que ainda está só na fila local. */
  respondendoA?: number
}

export const TIPO_MENSAGEM = 'MENSAGEM'

async function enviar(
  payload: MensagemPayload,
  ctx: ContextoEnvio<MensagemPayload>,
): Promise<ResultadoEnvio> {
  const { data: sessao } = await supabase.auth.getSession()
  if (!sessao.session?.user.id) {
    return { ok: false, retentavel: true, mensagem: 'Sessão expirada -- faça login de novo.' }
  }

  // encarregado_id não tem gatilho de autoria (o gatilho no banco só
  // carimba autor_id) -- essa coluna também precisa aceitar um
  // GESTOR/ADMIN gravando na thread de OUTRA pessoa (não faria sentido um
  // default fixo em auth.uid()). Aqui, do lado do encarregado, é sempre o
  // próprio uid.
  const { error } = await supabase.from('frota_mensagens').insert({
    encarregado_id: sessao.session.user.id,
    texto: payload.texto,
    respondendo_a: payload.respondendoA ?? null,
    origem_local_id: ctx.itemId,
  })

  if (error && error.code !== VIOLACAO_UNICIDADE) {
    return { ok: false, ...classificarErroSupabase(error) }
  }
  // 23505 não é falha -- mensagem já tinha sido gravada numa tentativa
  // anterior cuja confirmação se perdeu. Sem foto, sem passo seguinte,
  // então não precisa recuperar id nenhum -- só confirmar sucesso.

  return { ok: true }
}

registrarHandler({ tipo: TIPO_MENSAGEM, enviar })
