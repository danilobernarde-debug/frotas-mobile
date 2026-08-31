import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { Aprovacao, Mensagem } from '../../lib/tipos'
import { TIPO_MENSAGEM, type MensagemPayload } from '../../outbox/handlers/mensagem'
import { TIPO_NOVA_SOLICITACAO, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { listarTodos } from '../../outbox/outbox'
import { assinarEstadoSync } from '../../outbox/syncEngine'
import type { OutboxItem } from '../../outbox/types'
import {
  gravarAprovacoesNoCache,
  gravarMensagensNoCache,
  lerCacheAprovacoes,
  lerCacheMensagens,
  maiorAtualizadoEmAprovacoes,
  maiorCriadoEmMensagens,
} from './cacheChat'
import type { EntradaChatReal } from './types'

/** Primeira abertura do app (cache local ainda vazio) -- teto de quantas
 *  linhas de cada tabela buscar pra não puxar o histórico inteiro de uma
 *  vez. Depois disso o cache só cresce por busca incremental (só o que
 *  mudou desde a última vez), então mensagens mais antigas que este teto
 *  na primeira instalação ficam de fora -- compromisso aceito a pedido do
 *  usuário (abrir rápido/gastar pouca rede importa mais que ver o
 *  histórico completo de cara). */
const LIMITE_PRIMEIRA_CARGA = 200

const SELECT_APROVACOES = '*, veiculo:frota_veiculos(id, placa, modelo)'
const SELECT_MENSAGENS = '*, autor:frota_perfis!frota_mensagens_autor_id_fkey(id, nome)'

function montarEntradas(
  aprovacoes: Aprovacao[],
  mensagens: Mensagem[],
  itensLocais: OutboxItem<NovaSolicitacaoPayload | MensagemPayload>[],
): EntradaChatReal[] {
  const doServidor: EntradaChatReal[] = aprovacoes.map((a) => ({
    fonte: 'servidor' as const,
    tipo: 'solicitacao' as const,
    id: `servidor-${a.id}`,
    criadoEm: a.criado_em,
    aprovacao: a,
  }))

  const doServidorMensagens: EntradaChatReal[] = mensagens.map((m) => ({
    fonte: 'servidor' as const,
    tipo: 'mensagem' as const,
    id: `servidor-msg-${m.id}`,
    criadoEm: m.criado_em,
    mensagem: m,
  }))

  const doLocal: EntradaChatReal[] = itensLocais
    .filter((item) => item.tipo === TIPO_NOVA_SOLICITACAO && item.status !== 'enviado')
    .map((item) => ({
      fonte: 'local' as const,
      tipo: 'solicitacao' as const,
      id: `local-${item.id}`,
      criadoEm: item.criadoEm,
      item: item as OutboxItem<NovaSolicitacaoPayload>,
    }))

  const doLocalMensagens: EntradaChatReal[] = itensLocais
    .filter((item) => item.tipo === TIPO_MENSAGEM && item.status !== 'enviado')
    .map((item) => ({
      fonte: 'local' as const,
      tipo: 'mensagem' as const,
      id: `local-msg-${item.id}`,
      criadoEm: item.criadoEm,
      item: item as OutboxItem<MensagemPayload>,
    }))

  return [...doServidor, ...doServidorMensagens, ...doLocal, ...doLocalMensagens].sort(
    (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
  )
}

/**
 * Mescla o histórico do servidor (frota_aprovacoes + frota_mensagens) com
 * o que ainda está só na fila local (pendente/erro) -- é a própria
 * thread do chat, não uma lista separada. Itens da fila já 'enviado' não
 * entram aqui: a partir desse ponto o registro do servidor é que
 * representa a solicitação/mensagem, ou apareceria duplicada.
 *
 * Cache local (SQLite, ver cacheChat.ts) + busca incremental, não mais
 * "recarrega tudo toda vez": abre já mostrando o que tinha salvo (rápido,
 * funciona sem rede) e busca só o que mudou desde a última vez -- e
 * Realtime (Supabase) no lugar do poll de 30s fixo, avisando na hora
 * quando alguma coisa muda, igual ao painel web já faz.
 *
 * `encarregadoId` (opcional): sem ele, é a própria thread de quem está
 * logado (uso de sempre, chat.tsx do ENCARREGADO) -- RLS sozinho já limita
 * a isso, sem precisar de filtro nenhum na consulta. Com ele, é a thread de
 * UMA pessoa específica vista por um GESTOR/ADMIN (conversas/[id].tsx) --
 * aí sim filtra explicitamente (mesmo padrão de
 * frotas-web/src/app/(painel)/atividade/dados.ts:39,46), inclusive na
 * leitura/watermark do cache local (ver cacheChat.ts), já que o cache
 * guarda tudo junto no mesmo SQLite.
 */
export function useMinhasSolicitacoes(encarregadoId?: string) {
  const { perfil } = useAuth()
  const [entradas, setEntradas] = useState<EntradaChatReal[]>([])
  const [carregando, setCarregando] = useState(true)
  const cacheAprovacoesRef = useRef<Map<number, Aprovacao>>(new Map())
  const cacheMensagensRef = useRef<Map<number, Mensagem>>(new Map())

  const publicarEntradas = useCallback(async () => {
    const itensLocais = await listarTodos<NovaSolicitacaoPayload | MensagemPayload>()
    setEntradas(
      montarEntradas(
        [...cacheAprovacoesRef.current.values()],
        [...cacheMensagensRef.current.values()],
        itensLocais,
      ),
    )
  }, [])

  /** Busca só o que é novo desde a última vez (ou uma janela recente, na
   *  primeira carga com cache vazio) e mescla no cache local + na tela. */
  const buscarNovidades = useCallback(async () => {
    if (!perfil) return
    const [desdeAprovacoes, desdeMensagens] = await Promise.all([
      maiorAtualizadoEmAprovacoes(encarregadoId),
      maiorCriadoEmMensagens(encarregadoId),
    ])

    let consultaAprovacoes = supabase.from('frota_aprovacoes').select(SELECT_APROVACOES)
    let consultaMensagens = supabase.from('frota_mensagens').select(SELECT_MENSAGENS)
    if (encarregadoId) {
      consultaAprovacoes = consultaAprovacoes.eq('solicitante_id', encarregadoId)
      consultaMensagens = consultaMensagens.eq('encarregado_id', encarregadoId)
    }

    const [respostaAprovacoes, respostaMensagens] = await Promise.all([
      desdeAprovacoes
        ? consultaAprovacoes.gt('atualizado_em', desdeAprovacoes).order('atualizado_em', { ascending: true })
        : consultaAprovacoes.order('criado_em', { ascending: false }).limit(LIMITE_PRIMEIRA_CARGA),
      desdeMensagens
        ? consultaMensagens.gt('criado_em', desdeMensagens).order('criado_em', { ascending: true })
        : consultaMensagens.order('criado_em', { ascending: false }).limit(LIMITE_PRIMEIRA_CARGA),
    ])

    const novasAprovacoes = (respostaAprovacoes.data as Aprovacao[] | null) ?? []
    const novasMensagens = (respostaMensagens.data as Mensagem[] | null) ?? []

    for (const a of novasAprovacoes) cacheAprovacoesRef.current.set(a.id, a)
    for (const m of novasMensagens) cacheMensagensRef.current.set(m.id, m)

    // Sequencial, não Promise.all -- as duas gravações usam withTransactionAsync
    // na MESMA conexão SQLite (expo-sqlite é uma conexão só), e rodar duas
    // transações ao mesmo tempo nela lança "cannot start a transaction
    // within a transaction" (achado real, visto ao testar: chat abria
    // vazio e 3 erros empilhavam na tela).
    await gravarAprovacoesNoCache(novasAprovacoes)
    await gravarMensagensNoCache(novasMensagens)
    await publicarEntradas()
  }, [perfil, encarregadoId, publicarEntradas])

  // Carga inicial: lê o cache local primeiro (mostra na hora, mesmo sem
  // rede/antes da rede responder) e só depois busca as novidades.
  useEffect(() => {
    if (!perfil) return
    let cancelado = false
    ;(async () => {
      const [aprovacoesCache, mensagensCache] = await Promise.all([
        lerCacheAprovacoes(encarregadoId),
        lerCacheMensagens(encarregadoId),
      ])
      if (cancelado) return
      cacheAprovacoesRef.current = new Map(aprovacoesCache.map((a) => [a.id, a]))
      cacheMensagensRef.current = new Map(mensagensCache.map((m) => [m.id, m]))
      await publicarEntradas()
      setCarregando(false)
      await buscarNovidades()
    })()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id, encarregadoId])

  // Ref com a versão mais nova de buscarNovidades -- os três efeitos
  // abaixo (sync, AppState, Realtime) chamam sempre a atual sem precisar
  // dela como dependência. Sem isto, cada um reagia a QUALQUER mudança de
  // referência de `perfil` (objeto novo do useAuth() a cada re-render,
  // não só quando o id muda de verdade) e recriava o canal Realtime toda
  // hora -- achado real, visto ao vivo no iPhone: "cannot add
  // postgres_changes callbacks... after subscribe()". O motivo exato:
  // supabase.channel(mesmoNome) devolve o MESMO canal já inscrito se a
  // remoção do anterior (removeChannel, assíncrona) ainda não tinha
  // terminado quando o efeito rodava de novo -- os novos .on() caíam
  // então num canal que já tinha passado por subscribe(), o que a
  // biblioteca recusa. Sem essa recriação a toda hora, a corrida não
  // acontece mais.
  const buscarNovidadesRef = useRef(buscarNovidades)
  useEffect(() => {
    buscarNovidadesRef.current = buscarNovidades
  }, [buscarNovidades])

  // Recarrega sempre que uma rodada de sync termina -- é assim que uma
  // solicitação/mensagem "local" vira "servidor" na tela, e que a decisão
  // do gestor (aprovado/reprovado) aparece depois de sincronizar de novo.
  useEffect(() => {
    return assinarEstadoSync((estado) => {
      if (!estado.sincronizando) buscarNovidadesRef.current()
    })
  }, [])

  // Volta pro primeiro plano / rede reconecta -- Realtime (abaixo) pode ter
  // perdido eventos enquanto desconectado, então uma busca incremental
  // continua valendo como rede de segurança nessas transições.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') buscarNovidadesRef.current()
    })
    return () => assinatura.remove()
  }, [])

  // Realtime no lugar do poll de 30s fixo -- mesma ideia já usada no
  // painel web (AtualizacaoAutomatica): não confia no payload do evento
  // pra montar a linha final (RLS/joins ficam por conta da consulta
  // normal), só usa o evento como aviso de "algo mudou, vai ver o que" --
  // debounce curto evita empilhar uma busca por linha quando várias mudam
  // juntas (ex.: o app mobile de outro encarregado sincronizando várias de
  // uma vez). Depende só de perfil?.id/encarregadoId (não do objeto
  // `perfil` inteiro nem de `buscarNovidades`) -- ver comentário grande
  // acima do porquê.
  //
  // Sufixo aleatório no nome do canal (mesmo com as dependências já
  // estáveis): achado real, visto de novo ao vivo mesmo depois do
  // comentário acima -- remontar a MESMA tela rápido o bastante (ex.:
  // sair e entrar de novo em "Conversas") roda um novo efeito antes do
  // removeChannel() do anterior (assíncrono) terminar; como
  // supabase.channel(mesmoNome) reaproveita o canal já registrado
  // enquanto a remoção não termina, os .on() novos caíam de novo num
  // canal já com subscribe() feito. Um nome único por montagem elimina
  // esse reaproveitamento de vez, sem depender de timing.
  useEffect(() => {
    if (!perfil?.id) return
    const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null }
    const idUnico = Math.random().toString(36).slice(2)
    const canal = supabase.channel(`frota-chat:${perfil.id}:${encarregadoId ?? 'proprio'}:${idUnico}`)
    for (const tabela of ['frota_aprovacoes', 'frota_mensagens']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => buscarNovidadesRef.current(), 400)
      })
    }
    canal.subscribe()
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      supabase.removeChannel(canal)
    }
  }, [perfil?.id, encarregadoId])

  return { entradas, carregando, recarregar: buscarNovidades }
}
