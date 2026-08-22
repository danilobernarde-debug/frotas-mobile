import NetInfo from '@react-native-community/netinfo'
import { useEffect, useState } from 'react'

export function useNetworkStatus() {
  const [conectado, setConectado] = useState(true)

  useEffect(() => {
    return NetInfo.addEventListener((estado) => {
      setConectado(Boolean(estado.isConnected))
    })
  }, [])

  return conectado
}
