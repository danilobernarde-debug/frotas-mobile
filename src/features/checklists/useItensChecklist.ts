import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ItemChecklistModelo } from '../../lib/tipos'

const CHAVE_CACHE = 'cache:itens_checklist'

/** Os 20 itens do checklist, lidos do banco (nunca hardcoded -- o web
 *  também lê assim) e cacheados pro formulário abrir mesmo sem sinal. */
export function useItensChecklist() {
  const [itens, setItens] = useState<ItemChecklistModelo[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const { data, error } = await supabase
        .from('frota_checklist_itens_modelo')
        .select('*')
        .eq('ativo', true)
        .order('ordem')

      if (cancelado) return

      if (!error && data) {
        setItens(data as ItemChecklistModelo[])
        AsyncStorage.setItem(CHAVE_CACHE, JSON.stringify(data)).catch(() => {})
      } else {
        const emCache = await AsyncStorage.getItem(CHAVE_CACHE)
        if (emCache && !cancelado) setItens(JSON.parse(emCache) as ItemChecklistModelo[])
      }
      if (!cancelado) setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  return { itens, carregando }
}
