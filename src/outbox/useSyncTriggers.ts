import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { runSync } from './syncEngine'

/**
 * Liga os dois gatilhos automáticos (primeiro plano, reconexão) -- chamar
 * uma vez, no layout raiz. O terceiro gatilho (puxar-pra-atualizar) é só
 * `runSync()` chamado direto de onRefresh na tela.
 */
export function useSyncTriggers() {
  useEffect(() => {
    runSync()

    const assinaturaEstado = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') runSync()
    })

    const cancelarRede = NetInfo.addEventListener((estado) => {
      if (estado.isConnected) runSync()
    })

    return () => {
      assinaturaEstado.remove()
      cancelarRede()
    }
  }, [])
}
