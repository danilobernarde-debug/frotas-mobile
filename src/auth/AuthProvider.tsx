import type { Session } from '@supabase/supabase-js'
import { createContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/tipos'

export interface EstadoAuth {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>
  sair: () => Promise<void>
}

export const AuthContext = createContext<EstadoAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(userId: string) {
    const { data } = await supabase.from('frota_perfis').select('*').eq('id', userId).single()
    setPerfil((data as Perfil) ?? null)
  }

  useEffect(() => {
    // getSession() lê a sessão persistida localmente, sem chamar rede --
    // essencial pro app abrir logado mesmo sem sinal. getUser() (que o
    // painel web usa de propósito) exigiria rede e derrubaria a sessão
    // toda vez que o encarregado abrisse o app no campo sem conexão.
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      if (data.session) carregarPerfil(data.session.user.id)
      setCarregando(false)
    })

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao)
      if (novaSessao) {
        carregarPerfil(novaSessao.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => assinatura.subscription.unsubscribe()
  }, [])

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    return { erro: error?.message ?? null }
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ sessao, perfil, carregando, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  )
}
