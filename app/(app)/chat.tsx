import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraEntrada } from '../../src/features/chat/BarraEntrada'
import { BolhaMensagem } from '../../src/features/chat/BolhaMensagem'
import { BolhaSolicitacao } from '../../src/features/chat/BolhaSolicitacao'
import { ConteudoFluxo } from '../../src/features/chat/ConteudoFluxo'
import type { EntradaChat } from '../../src/features/chat/types'
import { useDivisorNaoLidas } from '../../src/features/chat/useDivisorNaoLidas'
import { useFluxoSolicitacao } from '../../src/features/chat/useFluxoSolicitacao'
import { useMinhasSolicitacoes } from '../../src/features/chat/useMinhasSolicitacoes'
import type { CategoriaSolicitacao } from '../../src/lib/tipos'
import { useNetworkStatus } from '../../src/net/useNetworkStatus'
import { useSyncStatus } from '../../src/outbox/useSyncStatus'
import { CabecalhoApp } from '../../src/ui/CabecalhoApp'

/** Um roteiro por vez. Isolado num componente próprio, remontado com uma
 *  `key` nova a cada início (mesmo repetindo a mesma categoria) -- é o
 *  jeito de garantir que useFluxoSolicitacao() sempre nasce do zero,
 *  nunca herda veículo/foto/descrição de uma tentativa cancelada antes. */
function SecaoFluxo({
  categoria,
  onNovaCategoria,
  onConcluido,
  onCancelar,
}: {
  categoria: CategoriaSolicitacao
  onNovaCategoria: (categoria: CategoriaSolicitacao) => void
  onConcluido: () => void
  onCancelar: () => void
}) {
  const fluxo = useFluxoSolicitacao(categoria)
  return (
    <>
      {/* "Cancelar" fica sempre visível enquanto o roteiro está aberto --
          antes só existia "Voltar", que nem aparecia no primeiro passo,
          então não tinha como sair de uma solicitação iniciada por
          engano sem preencher tudo até o fim. */}
      <View style={styles.barraFluxo}>
        {fluxo.passoAtual > 0 ? (
          <Pressable onPress={fluxo.voltar} hitSlop={10}>
            <Text style={styles.voltarTexto}>← Voltar</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={onCancelar} hitSlop={10}>
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </View>
      <ConteudoFluxo fluxo={fluxo} />
      <BarraEntrada fluxo={fluxo} onNovaCategoria={onNovaCategoria} onConcluido={onConcluido} />
    </>
  )
}

export default function TelaChat() {
  const { entradas, carregando, recarregar } = useMinhasSolicitacoes()
  const entradasComDivisor = useDivisorNaoLidas(entradas)
  const { pendentes, sincronizando } = useSyncStatus()
  const conectado = useNetworkStatus()

  const [fluxoInfo, setFluxoInfo] = useState<{ categoria: CategoriaSolicitacao; chave: number } | null>(null)
  const proximaChave = useRef(0)
  const listaRef = useRef<FlatList<EntradaChat>>(null)
  // Rola pro final só na 1ª vez que a lista ganha conteúdo -- ao abrir o
  // chat, as mensagens mais recentes já aparecem na tela, sem precisar
  // arrastar (igual WhatsApp). Só uma vez: atualizações depois (poll,
  // nova mensagem chegando) não devem puxar a rolagem de quem já subiu
  // pra ler o histórico.
  const jaRolou = useRef(false)

  // onContentSizeChange (1ª tentativa) não disparava de forma confiável
  // no Android -- mesma categoria de instabilidade de plataforma já
  // achada com <Image> nesta sessão. useEffect + timeout curto (dá
  // tempo do layout da lista assentar antes de rolar) é o padrão mais
  // robusto pra isso.
  useEffect(() => {
    if (jaRolou.current || carregando || entradasComDivisor.length === 0) return
    jaRolou.current = true
    // scrollToEnd() sozinho não rolava de forma confiável (depende de
    // medição de conteúdo que nem sempre está pronta a tempo no
    // Android). scrollToOffset com um valor bem maior que qualquer
    // conteúdo possível força o máximo, sem depender dessa medição --
    // e repete a chamada mais uma vez logo depois, cobrindo o caso de
    // mais itens ainda estarem entrando no layout.
    const idA = setTimeout(() => listaRef.current?.scrollToOffset({ offset: 999999, animated: false }), 150)
    const idB = setTimeout(() => listaRef.current?.scrollToOffset({ offset: 999999, animated: false }), 500)
    return () => {
      clearTimeout(idA)
      clearTimeout(idB)
    }
  }, [carregando, entradasComDivisor.length])

  const textoStatus = !conectado
    ? 'Sem conexão'
    : sincronizando
      ? 'Sincronizando…'
      : pendentes > 0
        ? `${pendentes} pendente(s)`
        : 'Tudo sincronizado'

  function iniciarFluxo(categoria: CategoriaSolicitacao) {
    proximaChave.current += 1
    setFluxoInfo({ categoria, chave: proximaChave.current })
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <CabecalhoApp mostrarVoltar subtitulo={textoStatus} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listaRef}
          data={entradasComDivisor}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.tipo === 'divisor' ? (
              <View style={styles.divisor}>
                <View style={styles.divisorLinha} />
                <Text style={styles.divisorTexto}>Mensagens não lidas</Text>
                <View style={styles.divisorLinha} />
              </View>
            ) : item.tipo === 'mensagem' ? (
              <BolhaMensagem entrada={item} />
            ) : (
              <BolhaSolicitacao entrada={item} />
            )
          }
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
          ListEmptyComponent={
            !carregando && !fluxoInfo ? (
              <View style={styles.vazio}>
                <Text style={styles.vazioTexto}>
                  Nenhuma solicitação ou mensagem ainda. Toque em + pra pedir algo, ou escreva abaixo.
                </Text>
              </View>
            ) : null
          }
        />

        {fluxoInfo ? (
          <SecaoFluxo
            key={fluxoInfo.chave}
            categoria={fluxoInfo.categoria}
            onNovaCategoria={iniciarFluxo}
            onConcluido={() => {
              setFluxoInfo(null)
              recarregar()
            }}
            onCancelar={() => setFluxoInfo(null)}
          />
        ) : (
          <BarraEntrada fluxo={null} onNovaCategoria={iniciarFluxo} onConcluido={recarregar} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#cbd5e1' },
  divisorTexto: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  barraFluxo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  voltarTexto: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  cancelarTexto: { color: '#be123c', fontWeight: '600', fontSize: 13 },
})
