import { uuid } from '../lib/uuid'
import { obterBanco } from './db'
import type { OutboxItem, StatusOutbox } from './types'

interface LinhaOutbox {
  id: string
  tipo: string
  payload_json: string
  status: StatusOutbox
  permanente: number
  tentativas: number
  erro_msg: string | null
  criado_em: string
  atualizado_em: string
}

function converter<T>(linha: LinhaOutbox): OutboxItem<T> {
  return {
    id: linha.id,
    tipo: linha.tipo,
    payload: JSON.parse(linha.payload_json) as T,
    status: linha.status,
    permanente: linha.permanente === 1,
    tentativas: linha.tentativas,
    erroMsg: linha.erro_msg,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
  }
}

/** Novo item na fila. O id gerado aqui também é usado como origem_local_id
 *  na tabela real (frota_aprovacoes/frota_checklists) -- é a mesma chave
 *  de ponta a ponta, não dois ids diferentes pra mesma solicitação. */
export async function enfileirar<T>(tipo: string, payload: T): Promise<string> {
  const db = await obterBanco()
  const id = uuid()
  const agora = new Date().toISOString()
  await db.runAsync(
    `insert into outbox_itens (id, tipo, payload_json, criado_em, atualizado_em)
     values (?, ?, ?, ?, ?)`,
    id, tipo, JSON.stringify(payload), agora, agora,
  )
  return id
}

export async function listarTodos<T = unknown>(): Promise<OutboxItem<T>[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<LinhaOutbox>(
    'select * from outbox_itens order by criado_em asc',
  )
  return linhas.map(converter<T>)
}

export async function listarPendentes<T = unknown>(): Promise<OutboxItem<T>[]> {
  const db = await obterBanco()
  const linhas = await db.getAllAsync<LinhaOutbox>(
    `select * from outbox_itens
      where status in ('pendente', 'erro') and permanente = 0
      order by criado_em asc`,
  )
  return linhas.map(converter<T>)
}

export async function contarPendentes(): Promise<number> {
  const db = await obterBanco()
  const linha = await db.getFirstAsync<{ n: number }>(
    "select count(*) as n from outbox_itens where status != 'enviado'",
  )
  return linha?.n ?? 0
}

async function tocar(id: string, campos: string, valores: (string | number)[]) {
  const db = await obterBanco()
  await db.runAsync(
    `update outbox_itens set atualizado_em = ?, ${campos} where id = ?`,
    new Date().toISOString(), ...valores, id,
  )
}

export async function marcarEnviando(id: string) {
  const db = await obterBanco()
  await db.runAsync(
    "update outbox_itens set status = 'enviando', tentativas = tentativas + 1, atualizado_em = ? where id = ?",
    new Date().toISOString(), id,
  )
}

export async function marcarEnviado(id: string) {
  await tocar(id, "status = 'enviado'", [])
}

export async function marcarErro(id: string, mensagem: string, permanente: boolean) {
  await tocar(id, 'status = ?, erro_msg = ?, permanente = ?', [
    'erro', mensagem, permanente ? 1 : 0,
  ])
}

/** Chamado pelos handlers pra gravar progresso parcial (ex.: o id da
 *  aprovação assim que o insert do "pai" confirma, ou o status de cada
 *  foto) -- é o que permite retomar exatamente de onde parou depois de
 *  uma queda no meio do envio. */
export async function atualizarPayload<T>(id: string, payload: T) {
  await tocar(id, 'payload_json = ?', [JSON.stringify(payload)])
}
