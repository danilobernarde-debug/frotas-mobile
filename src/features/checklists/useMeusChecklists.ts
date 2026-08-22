import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { Checklist } from '../../lib/tipos'
import { TIPO_CHECKLIST, type ChecklistPayload } from '../../outbox/handlers/checklist'
import { listarTodos } from '../../outbox/outbox'
import { assinarEstadoSync } from '../../outbox/syncEngine'
import type { OutboxItem } from '../../outbox/types'

export type EntradaChecklist =
  | { fonte: 'servidor'; id: string; criadoEm: string; checklist: Checklist }
  | { fonte: 'local'; id: string; criadoEm: string; item: OutboxItem<ChecklistPayload> }

export function useMeusChecklists() {
  const { perfil } = useAuth()
  const [entradas, setEntradas] = useState<EntradaChecklist[]>([])
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    if (!perfil) return

    const [resposta, itensLocais] = await Promise.all([
      supabase
        .from('frota_checklists')
        .select('*, veiculo:frota_veiculos(id, placa, modelo)')
        .order('criado_em', { ascending: false }),
      listarTodos<ChecklistPayload>(),
    ])

    const doServidor: EntradaChecklist[] = ((resposta.data as Checklist[]) ?? []).map((c) => ({
      fonte: 'servidor' as const,
      id: `servidor-${c.id}`,
      criadoEm: c.criado_em,
      checklist: c,
    }))

    const doLocal: EntradaChecklist[] = itensLocais
      .filter((item) => item.tipo === TIPO_CHECKLIST && item.status !== 'enviado')
      .map((item) => ({
        fonte: 'local' as const,
        id: `local-${item.id}`,
        criadoEm: item.criadoEm,
        item,
      }))

    setEntradas(
      [...doLocal, ...doServidor].sort(
        (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
      ),
    )
  }, [perfil])

  useEffect(() => {
    setCarregando(true)
    recarregar().finally(() => setCarregando(false))
  }, [recarregar])

  useEffect(() => {
    return assinarEstadoSync((estado) => {
      if (!estado.sincronizando) recarregar()
    })
  }, [recarregar])

  return { entradas, carregando, recarregar }
}
