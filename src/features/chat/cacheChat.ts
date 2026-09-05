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

/**
 * Versão do FORMATO das linhas guardadas em cache_aprovacoes.
 *
 * O cache guarda a linha do servidor como JSON, então coluna nova não
 * exige mudança de schema aqui -- mas as linhas JÁ gravadas continuam com
 * o formato antigo, e a busca incremental (`atualizado_em > maior em
 * cache`) nunca mais volta nelas. Na prática, campo novo só aparecia em
 * solicitação que voltasse a ser alterada depois da atualização do app.
 *
 * Foi exatamente o que aconteceu ao passar a trazer `anexos` junto: as
 * solicitações já pagas seguiam sem o aviso de comprovante no card, e o
 * recurso parecia quebrado no aparelho de quem já usava o app.
 *
 * SUBA ESTE NÚMERO sempre que mudar o que SELECT_APROVACOES pede
 * (useMinhasSolicitacoes). Isso força UMA recarga da janela recente, que
 * regrava as linhas no formato novo. Nada é apagado -- a regravação é um
 * upsert por id, então solicitação antiga fora da janela continua no
 * cache do jeito que estava.
 *
 * 1 = versão inicial, com `anexos` (tipos) embutido na linha.
 */
export const VERSAO_CACHE_APROVACOES = 1

/** Se o cache foi gravado por uma versão anterior do app -- quem chama
 *  usa isto pra ignorar o cursor incremental UMA vez. */
export async function cacheAprovacoesDesatualizado(): Promise<boolean> {
  const db = await obterBanco()
  const linha = await db.getFirstAsync<{ user_version: number }>('pragma user_version')
  return (linha?.user_version ?? 0) < VERSAO_CACHE_APROVACOES
}

/** Só depois da recarga ter dado certo -- marcar antes deixaria o cache
 *  meio velho marcado como novo se a rede falhasse no meio. */
export async function marcarCacheAprovacoesAtualizado(): Promise<void> {
  const db = await obterBanco()
  // Em chamada própria, não junto de outro execAsync: no iOS o execAsync
  // envolve o texto todo numa transação (ver o comentário do
  // journal_mode em outbox/db.ts), e pragma é melhor manter fora disso.
  await db.execAsync(`pragma user_version = ${VERSAO_CACHE_APROVACOES}`)
}

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
