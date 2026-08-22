import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Veiculo } from '../../lib/tipos'

const CHAVE_CACHE = 'cache:veiculos'

/**
 * Lista de veículos pro seletor do chat/checklist. Mesmo predicado de
 * listarVeiculosAtivos() no frotas-web (inclui OFICINA/PARADO, só exclui
 * VENDIDO/INATIVO). Guarda em cache local: sem isso, abrir o formulário
 * sem sinal quebra no primeiro campo.
 */
export function useVeiculos() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('frota_veiculos')
      .select('id, placa, modelo, regional_id, km_atual')
      .not('status', 'in', '("VENDIDO","INATIVO")')
      .order('placa')

    if (!error && data) {
      setVeiculos(data as Veiculo[])
      AsyncStorage.setItem(CHAVE_CACHE, JSON.stringify(data)).catch(() => {})
      return
    }

    const emCache = await AsyncStorage.getItem(CHAVE_CACHE)
    if (emCache) setVeiculos(JSON.parse(emCache) as Veiculo[])
  }, [])

  useEffect(() => {
    setCarregando(true)
    carregar().finally(() => setCarregando(false))
  }, [carregar])

  return { veiculos, carregando, recarregar: carregar }
}
