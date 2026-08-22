import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { Aprovacao } from '../../lib/tipos'
import { listarTodos } from '../../outbox/outbox'
import { assinarEstadoSync } from '../../outbox/syncEngine'
import { TIPO_NOVA_SOLICITACAO, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import type { EntradaChat } from './types'

/**
 * Mescla o histórico do servidor (frota_aprovacoes) com o que ainda está
 * só na fila local (pendente/erro) -- é a própria thread do chat, não uma
 * lista separada. Itens da fila já 'enviado' não entram aqui: a partir
 * desse ponto o registro do servidor é que representa a solicitação, ou
 * apareceria duplicada.
 */
export function useMinhasSolicitacoes() {
  const { perfil } = useAuth()
  const [entradas, setEntradas] = useState<EntradaChat[]>([])
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    if (!perfil) return

    const [resposta, itensLocais] = await Promise.all([
      supabase
        .from('frota_aprovacoes')
        .select('*, veiculo:frota_veiculos(id, placa, modelo)')
        .order('criado_em', { ascending: true }),
      listarTodos<NovaSolicitacaoPayload>(),
    ])

    const doServidor: EntradaChat[] = ((resposta.data as Aprovacao[]) ?? []).map((a) => ({
      fonte: 'servidor' as const,
      id: `servidor-${a.id}`,
      criadoEm: a.criado_em,
      aprovacao: a,
    }))

    const doLocal: EntradaChat[] = itensLocais
      .filter((item) => item.tipo === TIPO_NOVA_SOLICITACAO && item.status !== 'enviado')
      .map((item) => ({
        fonte: 'local' as const,
        id: `local-${item.id}`,
        criadoEm: item.criadoEm,
        item,
      }))

    const todas = [...doServidor, ...doLocal].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    )
    setEntradas(todas)
  }, [perfil])

  useEffect(() => {
    setCarregando(true)
    recarregar().finally(() => setCarregando(false))
  }, [recarregar])

  // Recarrega sempre que uma rodada de sync termina -- é assim que uma
  // solicitação "local" vira "servidor" na tela, e que a decisão do
  // gestor (aprovado/reprovado) aparece depois de sincronizar de novo.
  useEffect(() => {
    return assinarEstadoSync((estado) => {
      if (!estado.sincronizando) recarregar()
    })
  }, [recarregar])

  return { entradas, carregando, recarregar }
}
