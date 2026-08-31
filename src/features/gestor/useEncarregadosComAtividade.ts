import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import type { CategoriaSolicitacao, Mensagem } from '../../lib/tipos'

const ROTULO_ANEXO_PREVIA: Record<NonNullable<Mensagem['anexo_tipo']>, string> = {
  IMAGEM: '📷 Foto',
  AUDIO: '🎤 Áudio',
  DOCUMENTO: '📄 Documento',
  VIDEO: '🎬 Vídeo',
  LOCALIZACAO: '📍 Localização',
}

type LinhaAprovacao = {
  solicitante_id: string | null
  categoria: CategoriaSolicitacao | null
  status: string
  criado_em: string
}

type LinhaMensagem = {
  encarregado_id: string | null
  texto: string | null
  anexo_tipo: Mensagem['anexo_tipo']
  criado_em: string
  encarregado: { id: string; nome: string } | null
}

export interface EncarregadoComAtividade {
  encarregadoId: string
  nome: string
  ultimaMensagem: string
  ultimaMensagemEm: string
  pendentes: number
  categoriasPendentes: Set<CategoriaSolicitacao>
}

/**
 * Lista de encarregados que o GESTOR/ADMIN logado enxerga, agrupada a
 * partir da atividade (mensagem/solicitação) -- espelha a mesma lógica de
 * frotas-web/src/app/(painel)/atividade/page.tsx: RLS já limita as duas
 * consultas à regional de quem está logado (frota_pode_ver), então não
 * filtra por identidade aqui; só agrupa no cliente por encarregado_id.
 * Só vira cartão quem já trocou ao menos 1 mensagem -- uma solicitação
 * sozinha sem mensagem nenhuma não aparece (mesmo comportamento do painel
 * web: esta lista é a caixa de conversas, não uma visão geral de todo
 * pedido).
 */
export function useEncarregadosComAtividade() {
  const { perfil } = useAuth()
  const [itens, setItens] = useState<EncarregadoComAtividade[]>([])
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    if (!perfil) return
    const [respostaAprovacoes, respostaMensagens] = await Promise.all([
      supabase
        .from('frota_aprovacoes')
        .select('solicitante_id, categoria, status, criado_em')
        .not('solicitante_id', 'is', null)
        .order('criado_em', { ascending: false }),
      supabase
        .from('frota_mensagens')
        .select('encarregado_id, texto, anexo_tipo, criado_em, encarregado:frota_perfis!frota_mensagens_encarregado_id_fkey(id, nome)')
        .order('criado_em', { ascending: false }),
    ])

    const aprovacoes = (respostaAprovacoes.data as LinhaAprovacao[] | null) ?? []
    const mensagens = (respostaMensagens.data as unknown as LinhaMensagem[] | null) ?? []

    const porEncarregado = new Map<string, EncarregadoComAtividade>()

    // Mensagens já vêm ordenadas da mais nova pra mais velha -- a primeira
    // encontrada pra cada pessoa já é a última mensagem dela.
    for (const m of mensagens) {
      if (!m.encarregado_id || !m.encarregado) continue
      if (porEncarregado.has(m.encarregado_id)) continue
      porEncarregado.set(m.encarregado_id, {
        encarregadoId: m.encarregado_id,
        nome: m.encarregado.nome,
        ultimaMensagem: m.texto ?? (m.anexo_tipo ? ROTULO_ANEXO_PREVIA[m.anexo_tipo] : ''),
        ultimaMensagemEm: m.criado_em,
        pendentes: 0,
        categoriasPendentes: new Set(),
      })
    }

    for (const a of aprovacoes) {
      if (!a.solicitante_id || a.status !== 'PENDENTE') continue
      const atual = porEncarregado.get(a.solicitante_id)
      if (!atual) continue
      atual.pendentes += 1
      if (a.categoria) atual.categoriasPendentes.add(a.categoria)
    }

    setItens([...porEncarregado.values()].sort((a, b) => (a.ultimaMensagemEm < b.ultimaMensagemEm ? 1 : -1)))
  }, [perfil])

  // Ref com a versão mais nova de recarregar -- ver comentário grande em
  // useMinhasSolicitacoes.ts (mesmo hook irmão, mesmo achado real): sem
  // isto, o efeito de Realtime reagia a qualquer objeto `perfil` novo do
  // useAuth() (não só troca de id de verdade) e recriava o canal toda
  // hora, causando "cannot add postgres_changes callbacks... after
  // subscribe()" quando a remoção do canal anterior ainda não tinha
  // terminado.
  const recarregarRef = useRef(recarregar)
  useEffect(() => {
    recarregarRef.current = recarregar
  }, [recarregar])

  useEffect(() => {
    setCarregando(true)
    recarregarRef.current().finally(() => setCarregando(false))
  }, [perfil?.id])

  // Mesmo padrão de frotas-web/atividade-automatica: não confia no payload
  // do evento, só usa como aviso pra buscar de novo (debounce curto evita
  // empilhar uma busca por linha quando várias mudam juntas).
  useEffect(() => {
    if (!perfil?.id) return
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const canal = supabase.channel(`frota-atividade-gestor:${perfil.id}`)
    for (const tabela of ['frota_aprovacoes', 'frota_mensagens']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => recarregarRef.current(), 400)
      })
    }
    canal.subscribe()
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      supabase.removeChannel(canal)
    }
  }, [perfil?.id])

  return { itens, carregando, recarregar }
}
