import { APP_URL } from './env'
import type { CategoriaAnexoUpload } from './tipos'

export function urlAnexo(alvo: 'aprovacoes' | 'checklists', anexoId: number): string {
  return `${APP_URL}/api/mobile/anexos/${anexoId}?alvo=${alvo}`
}

/** `mensagemId` é o id da própria frota_mensagens, não de uma linha de
 *  anexo separada -- não existe uma pra chat (ver migration 0030). */
export function urlAnexoMensagem(mensagemId: number): string {
  return `${APP_URL}/api/mobile/anexo-mensagem/${mensagemId}`
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
  /** Só faz sentido pra alvo === 'checklists' -- identifica de qual dos
   *  20 itens é a foto (frota_checklist_fotos.item_id). */
  itemId?: number
  legenda?: string
  tokenAcesso: string
  /** Fotos do abastecimento e da manutenção carregam isto -- ver
   *  FotoPayload em outbox/handlers/novaSolicitacao.ts. Fotos de
   *  checklist nunca preenchem, então nunca entram no form. */
  capturadaEm?: string
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
  /** Só a observação em áudio usa: todo o resto que passa por aqui é
   *  foto. Sem isto o arquivo subiria anunciado como image/jpeg, e o
   *  player recusaria carregar bytes que não são imagem. */
  nomeArquivo?: string
  mime?: string
}): Promise<AnexoEnviado> {
  const form = new FormData()
  form.append('alvo', params.alvo)
  form.append(params.alvo === 'aprovacoes' ? 'aprovacao_id' : 'checklist_id', String(params.idPai))
  if (params.tipo) form.append('tipo', params.tipo)
  if (params.itemId !== undefined) form.append('item_id', String(params.itemId))
  if (params.legenda) form.append('legenda', params.legenda)
  if (params.capturadaEm) form.append('capturada_em', params.capturadaEm)
  if (params.latitude !== undefined) form.append('latitude', String(params.latitude))
  if (params.longitude !== undefined) form.append('longitude', String(params.longitude))
  if (params.localizacaoRotulo) form.append('localizacao_rotulo', params.localizacaoRotulo)
  // RN representa um arquivo local assim, não como Blob/File (isso não é
  // web) -- o cast é porque o tipo de FormData do TS não conhece esse
  // formato, mas é exatamente o que fetch do React Native espera.
  form.append('arquivo', {
    uri: params.uriArquivo,
    name: params.nomeArquivo ?? `${Date.now()}.jpg`,
    type: params.mime ?? 'image/jpeg',
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

export interface AnexoMensagemEnviado {
  caminho: string
  mime: string
  tamanho: number
}

/**
 * Sobe o anexo de UMA mensagem do chat (imagem/áudio/documento) --
 * diferente de enviarAnexo (fotos de aprovação/checklist), esta rota SÓ
 * sobe pro Drive, sem inserir nada no banco: frota_mensagens não tem
 * UPDATE (mensagem enviada é definitiva), então o handler do outbox
 * (outbox/handlers/mensagem.ts) precisa do resultado deste upload ANTES
 * de inserir a linha da mensagem, já com anexo_caminho preenchido.
 */
export async function enviarAnexoMensagem(params: {
  uriArquivo: string
  nomeArquivo: string
  mime: string
  categoria: CategoriaAnexoUpload
  tokenAcesso: string
}): Promise<AnexoMensagemEnviado> {
  const form = new FormData()
  form.append('categoria', params.categoria)
  form.append('arquivo', {
    uri: params.uriArquivo,
    name: params.nomeArquivo,
    type: params.mime,
  } as unknown as Blob)

  const resposta = await fetch(`${APP_URL}/api/mobile/anexo-mensagem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.tokenAcesso}` },
    body: form,
  })

  const corpo = await resposta.json()
  if (!resposta.ok) {
    throw new Error(corpo.erro ?? `Falha ao enviar anexo (status ${resposta.status}).`)
  }
  return corpo.anexo as AnexoMensagemEnviado
}

/** Apaga um anexo. Quem pode é a RLS que decide (0043) -- 404 aqui
 *  significa tanto "não existe" quanto "não é seu", de propósito. */
export async function removerAnexo(params: {
  alvo: 'aprovacoes' | 'checklists'
  anexoId: number
  tokenAcesso: string
}): Promise<void> {
  const resposta = await fetch(urlAnexo(params.alvo, params.anexoId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${params.tokenAcesso}` },
  })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null)
    throw new Error(corpo?.erro ?? `Falha ao remover o anexo (status ${resposta.status}).`)
  }
}

/**
 * Distância rodoviária de um trajeto. O cálculo é do servidor -- o app
 * não fala com serviço de rotas nem carrega malha viária.
 *
 * Devolve null sem reclamar quando não há internet: a distância é
 * conveniência pro motorista conferir o caminho, e o pedido tem que
 * poder sair mesmo sem ela.
 */
export async function consultarDistancia(params: {
  trajeto: { cidade: string; uf: string }[]
  tokenAcesso: string
}): Promise<number | null> {
  try {
    const resposta = await fetch(`${APP_URL}/api/mobile/distancia`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.tokenAcesso}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trajeto: params.trajeto }),
    })
    if (!resposta.ok) return null
    const corpo = (await resposta.json()) as { km?: number | null }
    return corpo.km ?? null
  } catch {
    return null
  }
}
