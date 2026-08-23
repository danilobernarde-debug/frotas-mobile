import { removerFotoLocal } from '../../camera/capturarFoto'
import { classificarErroSupabase, VIOLACAO_UNICIDADE } from '../../lib/erroSupabase'
import { enviarAnexo } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { CategoriaSolicitacao } from '../../lib/tipos'
import { registrarHandler } from '../handlerRegistry'
import type { ContextoEnvio, ResultadoEnvio } from '../types'

export interface FotoPayload {
  uriLocal: string
  tipo: string
  legenda?: string
  status: 'pendente' | 'enviado'
  /** Só nas 3 fotos do abastecimento -- alimentam a marca d'água no
   *  servidor. Capturadas no momento da foto, não do envio (importa num
   *  app offline-first, onde a foto pode subir horas depois). */
  capturadaEm?: string
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

export interface NovaSolicitacaoPayload {
  veiculoId: number
  categoria: CategoriaSolicitacao
  servico: string
  valor: number
  odometro: number | null
  fotos: FotoPayload[]
  aprovacaoId?: number
}

export const TIPO_NOVA_SOLICITACAO = 'NOVA_SOLICITACAO'

async function enviar(
  payload: NovaSolicitacaoPayload,
  ctx: ContextoEnvio<NovaSolicitacaoPayload>,
): Promise<ResultadoEnvio> {
  let aprovacaoId = payload.aprovacaoId

  if (!aprovacaoId) {
    const { data, error } = await supabase
      .from('frota_aprovacoes')
      .insert({
        veiculo_id: payload.veiculoId,
        categoria: payload.categoria,
        servico: payload.servico,
        valor: payload.valor,
        odometro: payload.odometro,
        origem_local_id: ctx.itemId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === VIOLACAO_UNICIDADE) {
        // Não é falha -- essa solicitação já tinha sido gravada numa
        // tentativa anterior cuja confirmação se perdeu antes de chegar
        // no aparelho. Recupera o id em vez de duplicar.
        const { data: existente, error: erroConsulta } = await supabase
          .from('frota_aprovacoes')
          .select('id')
          .eq('origem_local_id', ctx.itemId)
          .single()
        if (erroConsulta || !existente) {
          return { ok: false, retentavel: true, mensagem: erroConsulta?.message ?? 'Falha ao recuperar solicitação.' }
        }
        aprovacaoId = existente.id
      } else {
        return { ok: false, ...classificarErroSupabase(error) }
      }
    } else {
      aprovacaoId = data.id
    }

    await ctx.atualizarPayload({ aprovacaoId })
  }

  if (!aprovacaoId) {
    return { ok: false, retentavel: false, mensagem: 'Falha interna: id da aprovação não definido.' }
  }

  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) {
    return { ok: false, retentavel: true, mensagem: 'Sessão expirada -- faça login de novo.' }
  }

  for (const foto of payload.fotos) {
    if (foto.status === 'enviado') continue

    try {
      await enviarAnexo({
        alvo: 'aprovacoes',
        idPai: aprovacaoId,
        uriArquivo: foto.uriLocal,
        tipo: foto.tipo,
        legenda: foto.legenda,
        tokenAcesso: token,
        capturadaEm: foto.capturadaEm,
        latitude: foto.latitude,
        longitude: foto.longitude,
        localizacaoRotulo: foto.localizacaoRotulo,
      })
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e)
      return { ok: false, retentavel: true, mensagem }
    }

    removerFotoLocal(foto.uriLocal)

    const fotosAtualizadas = payload.fotos.map((f) =>
      f.uriLocal === foto.uriLocal ? { ...f, status: 'enviado' as const } : f,
    )
    payload = { ...payload, fotos: fotosAtualizadas }
    await ctx.atualizarPayload({ fotos: fotosAtualizadas })
  }

  return { ok: true }
}

registrarHandler({ tipo: TIPO_NOVA_SOLICITACAO, enviar })
