import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { Aprovacao, Mensagem } from '../../lib/tipos'
import { TIPO_MENSAGEM, type MensagemPayload } from '../../outbox/handlers/mensagem'
import { TIPO_NOVA_SOLICITACAO, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { listarTodos } from '../../outbox/outbox'
import { assinarEstadoSync } from '../../outbox/syncEngine'
import type { OutboxItem } from '../../outbox/types'
import type { EntradaChat } from './types'

const INTERVALO_POLL_MS = 30_000

/**
 * Mescla o histórico do servidor (frota_aprovacoes + frota_mensagens) com
 * o que ainda está só na fila local (pendente/erro) -- é a própria
 * thread do chat, não uma lista separada. Itens da fila já 'enviado' não
 * entram aqui: a partir desse ponto o registro do servidor é que
 * representa a solicitação/mensagem, ou apareceria duplicada.
 */
export function useMinhasSolicitacoes() {
  const { perfil } = useAuth()
  const [entradas, setEntradas] = useState<EntradaChat[]>([])
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    if (!perfil) return

    const [respostaAprovacoes, respostaMensagens, itensLocais] = await Promise.all([
      supabase
        .from('frota_aprovacoes')
        .select('*, veiculo:frota_veiculos(id, placa, modelo)')
        .order('criado_em', { ascending: true }),
      supabase
        .from('frota_mensagens')
        .select('*, autor:frota_perfis!frota_mensagens_autor_id_fkey(id, nome)')
        .order('criado_em', { ascending: true }),
      listarTodos<NovaSolicitacaoPayload | MensagemPayload>(),
    ])

    const doServidor: EntradaChat[] = ((respostaAprovacoes.data as Aprovacao[]) ?? []).map((a) => ({
      fonte: 'servidor' as const,
      tipo: 'solicitacao' as const,
      id: `servidor-${a.id}`,
      criadoEm: a.criado_em,
      aprovacao: a,
    }))

    const doServidorMensagens: EntradaChat[] = ((respostaMensagens.data as Mensagem[]) ?? []).map((m) => ({
      fonte: 'servidor' as const,
      tipo: 'mensagem' as const,
      id: `servidor-msg-${m.id}`,
      criadoEm: m.criado_em,
      mensagem: m,
    }))

    const doLocal: EntradaChat[] = itensLocais
      .filter((item) => item.tipo === TIPO_NOVA_SOLICITACAO && item.status !== 'enviado')
      .map((item) => ({
        fonte: 'local' as const,
        tipo: 'solicitacao' as const,
        id: `local-${item.id}`,
        criadoEm: item.criadoEm,
        item: item as OutboxItem<NovaSolicitacaoPayload>,
      }))

    const doLocalMensagens: EntradaChat[] = itensLocais
      .filter((item) => item.tipo === TIPO_MENSAGEM && item.status !== 'enviado')
      .map((item) => ({
        fonte: 'local' as const,
        tipo: 'mensagem' as const,
        id: `local-msg-${item.id}`,
        criadoEm: item.criadoEm,
        item: item as OutboxItem<MensagemPayload>,
      }))

    const todas = [...doServidor, ...doServidorMensagens, ...doLocal, ...doLocalMensagens].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    )
    setEntradas(todas)
  }, [perfil])

  useEffect(() => {
    setCarregando(true)
    recarregar().finally(() => setCarregando(false))
  }, [recarregar])

  // Recarrega sempre que uma rodada de sync termina -- é assim que uma
  // solicitação/mensagem "local" vira "servidor" na tela, e que a decisão
  // do gestor (aprovado/reprovado) aparece depois de sincronizar de novo.
  useEffect(() => {
    return assinarEstadoSync((estado) => {
      if (!estado.sincronizando) recarregar()
    })
  }, [recarregar])

  // Os gatilhos de sync (useSyncTriggers) só disparam em TRANSIÇÃO (app
  // volta pro primeiro plano, rede reconecta) -- se o encarregado deixa o
  // app aberto, conectado e em primeiro plano continuamente (esperando
  // resposta no campo), nada dispara de novo, e uma resposta nova da
  // gestão não aparece até alguma transição acontecer. runSync() é sobre
  // esvaziar a fila de SAÍDA, não sobre puxar mensagem nova -- os dois só
  // coincidem hoje por efeito colateral do estado de sync mudar. Poll
  // leve, só de leitura, fecha essa lacuna sem tocar no motor de sync
  // (que checklist/solicitação já usam).
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (AppState.currentState === 'active') recarregar()
    }, INTERVALO_POLL_MS)
    return () => clearInterval(intervalo)
  }, [recarregar])

  return { entradas, carregando, recarregar }
}
