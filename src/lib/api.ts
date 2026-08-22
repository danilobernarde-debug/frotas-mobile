import { APP_URL } from './env'

export function urlAnexo(alvo: 'aprovacoes' | 'checklists', anexoId: number): string {
  return `${APP_URL}/api/mobile/anexos/${anexoId}?alvo=${alvo}`
}

export interface AnexoEnviado {
  id: number
  caminho: string
  legenda: string | null
  criado_em: string
}

/**
 * Sobe uma foto pro backend, que faz a ponte com o Google Drive (a
 * credencial fica só no servidor, nunca no app) e grava a linha em
 * frota_aprovacao_anexos ou frota_checklist_fotos -- ver
 * frotas-web/src/app/api/mobile/anexos/route.ts.
 */
export async function enviarAnexo(params: {
  alvo: 'aprovacoes' | 'checklists'
  idPai: number
  uriArquivo: string
  tipo?: string
  legenda?: string
  tokenAcesso: string
}): Promise<AnexoEnviado> {
  const form = new FormData()
  form.append('alvo', params.alvo)
  form.append(params.alvo === 'aprovacoes' ? 'aprovacao_id' : 'checklist_id', String(params.idPai))
  if (params.tipo) form.append('tipo', params.tipo)
  if (params.legenda) form.append('legenda', params.legenda)
  // RN representa um arquivo local assim, não como Blob/File (isso não é
  // web) -- o cast é porque o tipo de FormData do TS não conhece esse
  // formato, mas é exatamente o que fetch do React Native espera.
  form.append('arquivo', {
    uri: params.uriArquivo,
    name: `${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob)

  const resposta = await fetch(`${APP_URL}/api/mobile/anexos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.tokenAcesso}` }, // sem Content-Type manual
    body: form,
  })

  const corpo = await resposta.json()
  if (!resposta.ok) {
    throw new Error(corpo.erro ?? `Falha ao enviar anexo (status ${resposta.status}).`)
  }
  return corpo.anexo as AnexoEnviado
}
