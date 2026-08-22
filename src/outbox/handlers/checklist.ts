import { removerFotoLocal } from '../../camera/capturarFoto'
import { classificarErroSupabase, VIOLACAO_UNICIDADE } from '../../lib/erroSupabase'
import { enviarAnexo } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { registrarHandler } from '../handlerRegistry'
import type { ContextoEnvio, ResultadoEnvio } from '../types'
import type { FotoPayload } from './novaSolicitacao'

export interface RespostaPayload {
  itemId: number
  conforme: boolean | null
  observacao?: string
}

export interface ChecklistPayload {
  veiculoId: number
  motoristaId?: number
  odometro?: number
  respostas: RespostaPayload[]
  fotos: FotoPayload[]
  checklistId?: number
}

export const TIPO_CHECKLIST = 'CHECKLIST'

async function enviar(
  payload: ChecklistPayload,
  ctx: ContextoEnvio<ChecklistPayload>,
): Promise<ResultadoEnvio> {
  let checklistId = payload.checklistId

  if (!checklistId) {
    const { data, error } = await supabase
      .from('frota_checklists')
      .insert({
        veiculo_id: payload.veiculoId,
        motorista_id: payload.motoristaId ?? null,
        odometro: payload.odometro ?? null,
        origem_local_id: ctx.itemId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === VIOLACAO_UNICIDADE) {
        const { data: existente, error: erroConsulta } = await supabase
          .from('frota_checklists')
          .select('id')
          .eq('origem_local_id', ctx.itemId)
          .single()
        if (erroConsulta || !existente) {
          return { ok: false, retentavel: true, mensagem: erroConsulta?.message ?? 'Falha ao recuperar checklist.' }
        }
        checklistId = existente.id
      } else {
        return { ok: false, ...classificarErroSupabase(error) }
      }
    } else {
      checklistId = data.id
    }

    await ctx.atualizarPayload({ checklistId })
  }

  if (!checklistId) {
    return { ok: false, retentavel: false, mensagem: 'Falha interna: id do checklist não definido.' }
  }

  // ignoreDuplicates faz o upsert virar "insere o que faltar, não toca no
  // que já existe" -- seguro de repetir se uma tentativa anterior já
  // tinha inserido as respostas mas caiu antes de confirmar isso na fila
  // local. Só exige política de INSERT (ON CONFLICT DO NOTHING não usa
  // UPDATE de verdade), então não precisou de política nova pra isso.
  const { error: erroRespostas } = await supabase.from('frota_checklist_respostas').upsert(
    payload.respostas.map((r) => ({
      checklist_id: checklistId,
      item_id: r.itemId,
      conforme: r.conforme,
      observacao: r.observacao ?? null,
    })),
    { onConflict: 'checklist_id,item_id', ignoreDuplicates: true },
  )
  if (erroRespostas) {
    return { ok: false, ...classificarErroSupabase(erroRespostas) }
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
        alvo: 'checklists',
        idPai: checklistId,
        uriArquivo: foto.uriLocal,
        legenda: foto.legenda,
        tokenAcesso: token,
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

registrarHandler({ tipo: TIPO_CHECKLIST, enviar })
