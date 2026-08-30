import * as SQLite from 'expo-sqlite'

const NOME_BANCO = 'outbox.db'

let bancoPromise: Promise<SQLite.SQLiteDatabase> | null = null

/**
 * API imperativa (openDatabaseAsync), não o SQLiteProvider/useSQLiteContext
 * do expo-sqlite -- o motor de sync roda fora de componentes React (gatilho
 * de AppState, reconexão de rede), então precisa acessar o banco sem
 * depender de um hook montado na árvore.
 */
export function obterBanco(): Promise<SQLite.SQLiteDatabase> {
  if (!bancoPromise) {
    bancoPromise = SQLite.openDatabaseAsync(NOME_BANCO).then(async (db) => {
      await db.execAsync(`
        pragma journal_mode = WAL;

        create table if not exists outbox_itens (
          id            text primary key,
          tipo          text not null,
          payload_json  text not null,
          status        text not null default 'pendente',
          permanente    integer not null default 0,
          tentativas    integer not null default 0,
          erro_msg      text,
          criado_em     text not null,
          atualizado_em text not null
        );

        -- Cache local do chat (solicitações + mensagens já confirmadas pelo
        -- servidor) -- guarda a linha inteira como JSON (mais simples que
        -- espelhar cada coluna, e sobrevive a campos novos sem migration).
        -- Existe pra abrir a conversa na hora (lê daqui primeiro, sem
        -- esperar rede) e pra sincronizar só o que mudou depois, em vez de
        -- buscar o histórico inteiro toda vez -- ver useMinhasSolicitacoes.
        create table if not exists cache_aprovacoes (
          id            integer primary key,
          criado_em     text not null,
          atualizado_em text not null,
          dado_json     text not null
        );
        create index if not exists idx_cache_aprovacoes_atualizado_em on cache_aprovacoes(atualizado_em);

        create table if not exists cache_mensagens (
          id        integer primary key,
          criado_em text not null,
          dado_json text not null
        );
        create index if not exists idx_cache_mensagens_criado_em on cache_mensagens(criado_em);
      `)

      // Um item só fica 'enviando' enquanto um runSync() está de fato no
      // ar -- se sobrou algum nesse estado ao abrir o app, foi um processo
      // anterior que morreu no meio (crash, app fechado à força). Volta
      // pra 'pendente' pra ser retomado no próximo sync.
      await db.runAsync("update outbox_itens set status = 'pendente' where status = 'enviando'")

      return db
    })
  }
  return bancoPromise
}
