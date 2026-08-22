import { useEffect, useState } from 'react'
import { contarPendentes } from './outbox'
import { assinarEstadoSync, type EstadoSync } from './syncEngine'

export function useSyncStatus() {
  const [estado, setEstado] = useState<EstadoSync>({ sincronizando: false, ultimoErro: null })
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    const cancelar = assinarEstadoSync((novoEstado) => {
      setEstado(novoEstado)
      contarPendentes().then(setPendentes)
    })
    contarPendentes().then(setPendentes)
    return cancelar
  }, [])

  return { ...estado, pendentes }
}
