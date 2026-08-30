import { enviarAnexoMensagem, type AnexoMensagemEnviado } from '../../lib/api'
import { classificarErroSupabase, VIOLACAO_UNICIDADE } from '../../lib/erroSupabase'
import { supabase } from '../../lib/supabase'
import type { CategoriaAnexoMensagem } from '../../lib/tipos'
import { registrarHandler } from '../handlerRegistry'
import type { ContextoEnvio, ResultadoEnvio } from '../types'

export interface AnexoMensagemPayload {
  uriLocal: string
  nomeArquivo: string
  mime: string
  categoria: CategoriaAnexoMensagem
  duracaoSegundos?: number
  /** Preenchido depois que o upload pro Drive dá certo (ver enviar()
   *  abaixo) -- protege um retry de subir o mesmo arquivo duas vezes.
   *  frota_mensagens não tem UPDATE, então o upload sempre acontece ANTES
   *  do insert, nunca depois. */
  enviado?: AnexoMensagemEnviado
}

export interface MensagemPayload {
  texto?: string
  /** Id (do servidor) da mensagem sendo respondida, estilo WhatsApp.
   *  Só mensagens já sincronizadas têm esse id -- não dá pra responder
   *  uma que ainda está só na fila local. Nunca junto com
   *  respondendoAprovacaoId -- é um ou outro. */
  respondendoA?: number
  /** Id da solicitação (abastecimento/manutenção) sendo respondida,
   *  quando a resposta é sobre uma solicitação em vez de uma mensagem. */
  respondendoAprovacaoId?: number
  /** Imagem/áudio/documento anexado, estilo WhatsApp -- texto vira legenda
   *  opcional quando presente (mesma regra da constraint
   *  frota_mensagens_texto_ou_anexo, migration 0030). */
  anexo?: AnexoMensagemPayload
}

export const TIPO_MENSAGEM = 'MENSAGEM'

async function enviar(
  payload: MensagemPayload,
  ctx: ContextoEnvio<MensagemPayload>,
): Promise<ResultadoEnvio> {
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!sessao.session?.user.id || !token) {
    return { ok: false, retentavel: true, mensagem: 'Sessão expirada -- faça login de novo.' }
  }

  let anexo = payload.anexo
  if (anexo && !anexo.enviado) {
    try {
      const enviado = await enviarAnexoMensagem({
        uriArquivo: anexo.uriLocal,
        nomeArquivo: anexo.nomeArquivo,
        mime: anexo.mime,
        categoria: anexo.categoria,
        tokenAcesso: token,
      })
      anexo = { ...anexo, enviado }
      await ctx.atualizarPayload({ anexo })
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e)
      return { ok: false, retentavel: true, mensagem }
    }
  }

  // encarregado_id não tem gatilho de autoria (o gatilho no banco só
  // carimba autor_id) -- essa coluna também precisa aceitar um
  // GESTOR/ADMIN gravando na thread de OUTRA pessoa (não faria sentido um
  // default fixo em auth.uid()). Aqui, do lado do encarregado, é sempre o
  // próprio uid.
  const { error } = await supabase.from('frota_mensagens').insert({
    encarregado_id: sessao.session.user.id,
    texto: payload.texto ?? null,
    respondendo_a: payload.respondendoA ?? null,
    respondendo_aprovacao_id: payload.respondendoAprovacaoId ?? null,
    origem_local_id: ctx.itemId,
    ...(anexo?.enviado
      ? {
          anexo_caminho: anexo.enviado.caminho,
          anexo_tipo: anexo.categoria,
          anexo_mime: anexo.enviado.mime,
          anexo_nome: anexo.nomeArquivo,
          anexo_tamanho: anexo.enviado.tamanho,
          anexo_duracao_segundos: anexo.duracaoSegundos ?? null,
        }
      : {}),
  })

  if (error && error.code !== VIOLACAO_UNICIDADE) {
    return { ok: false, ...classificarErroSupabase(error) }
  }
  // 23505 não é falha -- mensagem já tinha sido gravada numa tentativa
  // anterior cuja confirmação se perdeu. O anexo (se tinha) já subiu pro
  // Drive antes disso, então não precisa recuperar id nenhum -- só
  // confirmar sucesso.

  return { ok: true }
}

registrarHandler({ tipo: TIPO_MENSAGEM, enviar })
