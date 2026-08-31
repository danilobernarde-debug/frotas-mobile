import { obterBanco } from '../../outbox/db'
import type { Aprovacao, Mensagem } from '../../lib/tipos'

/**
 * Cache local (SQLite) das solicitações e mensagens do chat -- ver as
 * tabelas cache_aprovacoes/cache_mensagens em outbox/db.ts. Guarda a linha
 * inteira como JSON: mais simples que espelhar cada coluna, e um campo
 * novo no servidor não exige migration nenhuma aqui.
 *
 * Nada aqui é apagado sozinho (sem eviction) -- volume de chat de frota é
 * modesto, não vale a complexidade agora; se um dia virar problema real de
 * espaço, dá pra podar por data depois.
 */

/** `encarregadoId` filtra a leitura pra thread de UMA pessoa só -- usado
 *  pela conversa que um GESTOR/ADMIN abre pra ver alguém específico
 *  (conversas/[id].tsx). O cache guarda a linha inteira como JSON (sem
 *  coluna própria pra encarregado_id/solicitante_id), então o filtro é em
 *  memória depois de ler -- volume de chat de frota é pequeno, não compensa
 *  a complexidade de uma coluna indexada só pra isto agora. Sem o
 *  parâmetro, comportamento de sempre: cache inteiro (thread do próprio
 *  encarregado logado). */
export async function lerCacheAprovacoes(encarregadoId?: string): Promise<Aprovacao[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<{ dado_json: string }>(
    'select dado_json from cache_aprovacoes order by criado_em asc',
  )
  const todas = linhas.map((l) => JSON.parse(l.dado_json) as Aprovacao)
  return encarregadoId ? todas.filter((a) => a.solicitante_id === encarregadoId) : todas
}

export async function lerCacheMensagens(encarregadoId?: string): Promise<Mensagem[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<{ dado_json: string }>(
    'select dado_json from cache_mensagens order by criado_em asc',
  )
  const todas = linhas.map((l) => JSON.parse(l.dado_json) as Mensagem)
  return encarregadoId ? todas.filter((m) => m.encarregado_id === encarregadoId) : todas
}

/** Maior atualizado_em já em cache -- ponto de partida da busca
 *  incremental (`where atualizado_em > isto`). null = cache vazio, ainda
 *  não tem nenhuma solicitação salva (primeira abertura do app, ou
 *  primeira vez abrindo a thread desta pessoa específica). */
export async function maiorAtualizadoEmAprovacoes(encarregadoId?: string): Promise<string | null> {
  if (!encarregadoId) {
    const db = await obterBanco()
    const linha = await db.getFirstAsync<{ maior: string | null }>(
      'select max(atualizado_em) as maior from cache_aprovacoes',
    )
    return linha?.maior ?? null
  }
  const filtradas = await lerCacheAprovacoes(encarregadoId)
  return filtradas.reduce<string | null>((maior, a) => (!maior || a.atualizado_em > maior ? a.atualizado_em : maior), null)
}

/** Maior criado_em já em cache -- frota_mensagens não tem UPDATE (mensagem
 *  enviada é definitiva), então criado_em já basta pra saber o que é novo. */
export async function maiorCriadoEmMensagens(encarregadoId?: string): Promise<string | null> {
  if (!encarregadoId) {
    const db = await obterBanco()
    const linha = await db.getFirstAsync<{ maior: string | null }>(
      'select max(criado_em) as maior from cache_mensagens',
    )
    return linha?.maior ?? null
  }
  const filtradas = await lerCacheMensagens(encarregadoId)
  return filtradas.reduce<string | null>((maior, m) => (!maior || m.criado_em > maior ? m.criado_em : maior), null)
}

export async function gravarAprovacoesNoCache(linhas: Aprovacao[]): Promise<void> {
  if (linhas.length === 0) return
  const db = await obterBanco()
  await db.withTransactionAsync(async () => {
    for (const a of linhas) {
      await db.runAsync(
        `insert into cache_aprovacoes (id, criado_em, atualizado_em, dado_json) values (?, ?, ?, ?)
         on conflict(id) do update set criado_em = excluded.criado_em,
                                        atualizado_em = excluded.atualizado_em,
                                        dado_json = excluded.dado_json`,
        [a.id, a.criado_em, a.atualizado_em, JSON.stringify(a)],
      )
    }
  })
}

export async function gravarMensagensNoCache(linhas: Mensagem[]): Promise<void> {
  if (linhas.length === 0) return
  const db = await obterBanco()
  await db.withTransactionAsync(async () => {
    for (const m of linhas) {
      await db.runAsync(
        `insert into cache_mensagens (id, criado_em, dado_json) values (?, ?, ?)
         on conflict(id) do update set dado_json = excluded.dado_json`,
        [m.id, m.criado_em, JSON.stringify(m)],
      )
    }
  })
}
