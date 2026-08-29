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

const TEMPO_LIMITE_PERFIL_MS = 8000

// PromiseLike, não Promise: o builder de consulta do Supabase (PostgrestBuilder)
// é "thenable" mas não é uma instância de Promise de verdade (não tem
// .catch()/.finally()) -- só precisamos do .then() aqui mesmo.
function comTempoLimite<T>(promessa: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error('Tempo esgotado.')), ms)
    promessa.then(
      (valor) => { clearTimeout(temporizador); resolve(valor) },
      (erro) => { clearTimeout(temporizador); reject(erro) },
    )
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(userId: string) {
    // Junta o nome do motorista vinculado (se houver) numa tacada só --
    // é só pra exibir na tela de nova solicitação/checklist, não precisa
    // de uma consulta separada. !frota_perfis_motorista_id_fkey desambigua
    // de propósito: frota_motoristas também tem criado_por apontando pra
    // frota_perfis (autoria, trg_motoristas_autor), então sem indicar qual
    // das duas relações usar o PostgREST recusa a consulta com "Could not
    // embed because more than one relationship was found" (achado real,
    // travava o app inteiro no spinner de carregando -- ver abaixo).
    //
    // Tempo limite + repescagem sem o embed: PGRST201 acima não lança
    // exceção (só error preenchido), por isso o `if (error) throw` --
    // assim qualquer motivo de falha (esse, rede instável, RLS) cai no
    // mesmo caminho de retentativa, em vez de perfil ficar null pra
    // sempre e (app)/_layout.tsx preso no spinner achando que ainda tá
    // carregando.
    try {
      const { data, error } = await comTempoLimite(
        supabase
          .from('frota_perfis')
          .select('*, motorista:frota_motoristas!frota_perfis_motorista_id_fkey(nome)')
          .eq('id', userId)
          .single(),
        TEMPO_LIMITE_PERFIL_MS,
      )
      if (error) throw error
      if (!data) {
        setPerfil(null)
        return
      }
      const { motorista, ...perfil } = data as Perfil & { motorista: { nome: string } | null }
      setPerfil({ ...perfil, motoristaNome: motorista?.nome ?? null })
    } catch {
      try {
        const { data } = await comTempoLimite(
          supabase.from('frota_perfis').select('*').eq('id', userId).single(),
          TEMPO_LIMITE_PERFIL_MS,
        )
        setPerfil(data ? { ...(data as Perfil), motoristaNome: null } : null)
      } catch {
        setPerfil(null)
      }
    }
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
