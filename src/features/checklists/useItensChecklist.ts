import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ItemChecklistModelo, TipoChecklist } from '../../lib/tipos'

// Chave nova: a antiga (cache:itens_checklist) guardava só os itens, sem
// tipo nem seção -- lida por esta versão, mostraria tudo sem filtro.
const CHAVE_CACHE = 'cache:modelo_checklist_v2'

interface ModeloChecklist {
  tipos: TipoChecklist[]
  itens: ItemChecklistModelo[]
}

/** Tipos de checklist (Veículo, Máquina, ...) e os itens de todos eles,
 *  lidos do banco (nunca hardcoded -- o web também lê assim) e cacheados
 *  pro formulário abrir mesmo sem sinal. A tela filtra pelo tipo escolhido. */
export function useItensChecklist() {
  const [modelo, setModelo] = useState<ModeloChecklist>({ tipos: [], itens: [] })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const [tipos, itens] = await Promise.all([
        supabase.from('frota_checklist_tipos').select('*').eq('ativo', true).order('ordem'),
        supabase
          .from('frota_checklist_itens_modelo')
          .select('*')
          .eq('ativo', true)
          .order('tipo')
          .order('ordem'),
      ])

      if (cancelado) return

      if (!tipos.error && !itens.error && tipos.data && itens.data) {
        const novo = {
          tipos: tipos.data as TipoChecklist[],
          itens: itens.data as ItemChecklistModelo[],
        }
        setModelo(novo)
        AsyncStorage.setItem(CHAVE_CACHE, JSON.stringify(novo)).catch(() => {})
      } else {
        const emCache = await AsyncStorage.getItem(CHAVE_CACHE)
        if (emCache && !cancelado) setModelo(JSON.parse(emCache) as ModeloChecklist)
      }
      if (!cancelado) setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  return { tipos: modelo.tipos, itens: modelo.itens, carregando }
}
