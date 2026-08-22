import { useContext } from 'react'
import { AuthContext, type EstadoAuth } from './AuthProvider'

export function useAuth(): EstadoAuth {
  const contexto = useContext(AuthContext)
  if (!contexto) throw new Error('useAuth() precisa estar dentro de <AuthProvider>.')
  return contexto
}
