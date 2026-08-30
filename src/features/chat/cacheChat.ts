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

export async function lerCacheAprovacoes(): Promise<Aprovacao[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<{ dado_json: string }>(
    'select dado_json from cache_aprovacoes order by criado_em asc',
  )
  return linhas.map((l) => JSON.parse(l.dado_json) as Aprovacao)
}

export async function lerCacheMensagens(): Promise<Mensagem[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<{ dado_json: string }>(
    'select dado_json from cache_mensagens order by criado_em asc',
  )
  return linhas.map((l) => JSON.parse(l.dado_json) as Mensagem)
}

/** Maior atualizado_em já em cache -- ponto de partida da busca
 *  incremental (`where atualizado_em > isto`). null = cache vazio, ainda
 *  não tem nenhuma solicitação salva (primeira abertura do app). */
export async function maiorAtualizadoEmAprovacoes(): Promise<string | null> {
  const db = await obterBanco()
  const linha = await db.getFirstAsync<{ maior: string | null }>(
    'select max(atualizado_em) as maior from cache_aprovacoes',
  )
  return linha?.maior ?? null
}

/** Maior criado_em já em cache -- frota_mensagens não tem UPDATE (mensagem
 *  enviada é definitiva), então criado_em já basta pra saber o que é novo. */
export async function maiorCriadoEmMensagens(): Promise<string | null> {
  const db = await obterBanco()
  const linha = await db.getFirstAsync<{ maior: string | null }>(
    'select max(criado_em) as maior from cache_mensagens',
  )
  return linha?.maior ?? null
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
