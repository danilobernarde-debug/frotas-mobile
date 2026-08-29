import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewToken,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/auth/useAuth'
import { BarraEntrada } from '../../src/features/chat/BarraEntrada'
import { BolhaMensagem } from '../../src/features/chat/BolhaMensagem'
import { BolhaSolicitacao, ROTULO_CATEGORIA } from '../../src/features/chat/BolhaSolicitacao'
import { inserirDivisoresData } from '../../src/features/chat/divisoresData'
import { MenuAcoesMensagem } from '../../src/features/chat/MenuAcoesMensagem'
import type { EntradaChat, RespondendoA } from '../../src/features/chat/types'
import { useDivisorNaoLidas } from '../../src/features/chat/useDivisorNaoLidas'
import { useMinhasSolicitacoes } from '../../src/features/chat/useMinhasSolicitacoes'
import { diaRelativo } from '../../src/lib/formato'
import type { Aprovacao, CategoriaSolicitacao, Mensagem } from '../../src/lib/tipos'
import { useNetworkStatus } from '../../src/net/useNetworkStatus'
import { useSyncStatus } from '../../src/outbox/useSyncStatus'
import { CabecalhoApp } from '../../src/ui/CabecalhoApp'

/** Quanto tempo o selo de data fica visível depois que a rolagem para
 *  (ms) -- mesmo espírito do WhatsApp: aparece enquanto rola, some
 *  sozinho pouco depois de parar. */
const TEMPO_VISIVEL_SELO_DATA_MS = 1200

export default function TelaChat() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { entradas, carregando, recarregar } = useMinhasSolicitacoes()
  const entradasComDivisor = useDivisorNaoLidas(inserirDivisoresData(entradas))
  const { pendentes, sincronizando, ultimoErro } = useSyncStatus()
  const conectado = useNetworkStatus()

  const [respondendoA, setRespondendoA] = useState<RespondendoA | null>(null)
  // Menu suspenso estilo WhatsApp aberto por toque longo -- guarda o alvo
  // (mensagem ou solicitação) e o ponto da tela onde o dedo tocou, pra
  // MenuAcoesMensagem se posicionar perto dali.
  const [menuAberto, setMenuAberto] = useState<{ alvo: RespondendoA; ponto: { x: number; y: number } } | null>(
    null,
  )
  // Item (id de EntradaChat) que deve piscar um destaque agora, depois de
  // um toque em "ir pra mensagem original" -- some sozinho.
  const [destacado, setDestacado] = useState<string | null>(null)
  const timeoutDestaque = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pra mostrar a prévia de "respondendo a: ..." sem precisar de mais uma
  // consulta -- respondendo_a/respondendo_aprovacao_id são só ids, e tudo
  // que pode ser citado já está carregado aqui.
  const mensagensPorId = new Map<number, Mensagem>()
  const aprovacoesPorId = new Map<number, Aprovacao>()
  for (const e of entradas) {
    if (e.tipo === 'mensagem' && e.fonte === 'servidor') mensagensPorId.set(e.mensagem.id, e.mensagem)
    if (e.tipo === 'solicitacao' && e.fonte === 'servidor') aprovacoesPorId.set(e.aprovacao.id, e.aprovacao)
  }

  /** Resolve o que uma mensagem está respondendo (se algo) pra prévia
   *  tocável dentro da bolha -- null se não responde nada, ou se o alvo
   *  citado não está (mais) carregado nesta thread. */
  function resolverCitacao(m: Mensagem): { titulo: string; texto: string; alvoId: string } | null {
    if (m.respondendo_a != null) {
      const citada = mensagensPorId.get(m.respondendo_a)
      if (!citada) return null
      const nomeCitado = citada.autor_id === perfil?.id ? (perfil?.nome ?? 'Você') : (citada.autor?.nome ?? 'Gestão de frotas')
      return { titulo: nomeCitado, texto: citada.texto, alvoId: `servidor-msg-${citada.id}` }
    }
    if (m.respondendo_aprovacao_id != null) {
      const citada = aprovacoesPorId.get(m.respondendo_aprovacao_id)
      if (!citada) return null
      const rotulo = ROTULO_CATEGORIA[citada.categoria ?? 'OUTRO']
      return {
        titulo: `${rotulo} — ${citada.veiculo?.placa ?? '—'}`,
        texto: citada.servico,
        alvoId: `servidor-${citada.id}`,
      }
    }
    return null
  }

  const listaRef = useRef<FlatList<EntradaChat>>(null)

  // A tela de nova solicitação abre por cima do chat (Stack modal) sem
  // desmontá-lo -- ao voltar, o próprio chat continua montado e "recarregar"
  // não dispara sozinho. useFocusEffect cobre isso (e de brinde também o
  // retorno de solicitacao/[id], que tinha a mesma lacuna).
  useFocusEffect(
    useCallback(() => {
      recarregar()
    }, [recarregar]),
  )

  /** Rola até o item original a partir de um toque na citação -- sem
   *  getItemLayout (os itens têm alturas bem diferentes: divisor, bolha
   *  de 1 linha, cartão de solicitação inteiro), scrollToIndex sozinho
   *  não é confiável pra itens fora da janela renderizada; o próprio
   *  React Native recomenda esse fallback em onScrollToIndexFailed. */
  function irPara(alvoId: string) {
    const indice = entradasComDivisor.findIndex((e) => e.id === alvoId)
    if (indice === -1) return
    listaRef.current?.scrollToIndex({ index: indice, animated: true })
    destacar(alvoId)
  }

  /** Toque longo numa bolha não marca a resposta direto -- abre o menu
   *  suspenso (estilo WhatsApp) perto do ponto tocado; quem confirma
   *  "Responder" ali é que chama setRespondendoA. */
  function aoTocarLongo(alvo: RespondendoA, evento: GestureResponderEvent) {
    const { pageX, pageY } = evento.nativeEvent
    setMenuAberto({ alvo, ponto: { x: pageX, y: pageY } })
  }

  function destacar(alvoId: string) {
    setDestacado(alvoId)
    if (timeoutDestaque.current) clearTimeout(timeoutDestaque.current)
    timeoutDestaque.current = setTimeout(() => setDestacado(null), 1500)
  }

  function aoFalharScrollParaIndice(info: { index: number; averageItemLength: number }) {
    listaRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
    setTimeout(() => listaRef.current?.scrollToIndex({ index: info.index, animated: true }), 150)
  }
  // Rola pro final só na 1ª vez que a lista ganha conteúdo -- ao abrir o
  // chat, as mensagens mais recentes já aparecem na tela, sem precisar
  // arrastar (igual WhatsApp). Só uma vez: atualizações depois (poll,
  // nova mensagem chegando) não devem puxar a rolagem de quem já subiu
  // pra ler o histórico.
  const jaRolou = useRef(false)

  // Selo flutuante de data (estilo WhatsApp): mostra a data do topo da
  // tela enquanto rola, some sozinho pouco depois de parar.
  const [dataSelo, setDataSelo] = useState<string | null>(null)
  const opacidadeSeloData = useRef(new Animated.Value(0)).current
  const timeoutSeloData = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aoMudarItensVisiveis = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const primeiro = viewableItems[0]?.item as EntradaChat | undefined
    if (!primeiro) return
    setDataSelo(primeiro.tipo === 'divisor' ? primeiro.rotulo : diaRelativo(primeiro.criadoEm))
  }).current
  const configuracaoVisibilidade = useRef({ itemVisiblePercentThreshold: 0 }).current

  function aoRolarLista() {
    Animated.timing(opacidadeSeloData, { toValue: 1, duration: 120, useNativeDriver: true }).start()
    if (timeoutSeloData.current) clearTimeout(timeoutSeloData.current)
    timeoutSeloData.current = setTimeout(() => {
      Animated.timing(opacidadeSeloData, { toValue: 0, duration: 300, useNativeDriver: true }).start()
    }, TEMPO_VISIVEL_SELO_DATA_MS)
  }

  useEffect(() => {
    return () => {
      if (timeoutSeloData.current) clearTimeout(timeoutSeloData.current)
      if (timeoutDestaque.current) clearTimeout(timeoutDestaque.current)
    }
  }, [])

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

  // ultimoErro vem do motor de sincronização (assinarEstadoSync) -- é a
  // mensagem da última falha de envio (solicitação, foto, checklist ou
  // mensagem), reiniciada a cada nova rodada de sync. Sem mostrar isto,
  // uma foto que falhou ficava só como "1 pendente(s)" -- indistinguível
  // de "ainda enviando", quando na prática pode estar preso.
  const emErro = conectado && !sincronizando && Boolean(ultimoErro)
  const textoStatus = !conectado
    ? 'Sem conexão'
    : sincronizando
      ? 'Sincronizando…'
      : emErro
        ? `⚠️ ${ultimoErro}`
        : pendentes > 0
          ? `${pendentes} pendente(s)`
          : 'Tudo sincronizado'

  function iniciarFormulario(categoria: CategoriaSolicitacao) {
    router.push({ pathname: '/(app)/nova-solicitacao', params: { categoria } })
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <CabecalhoApp mostrarVoltar subtitulo={textoStatus} subtituloErro={emErro} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.areaLista}>
          <FlatList
            ref={listaRef}
            data={entradasComDivisor}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              item.tipo === 'divisor' ? (
                <View style={styles.divisor}>
                  <View style={styles.divisorLinha} />
                  <Text style={styles.divisorTexto}>{item.rotulo}</Text>
                  <View style={styles.divisorLinha} />
                </View>
              ) : item.tipo === 'mensagem' ? (
                <BolhaMensagem
                  entrada={item}
                  citacao={item.fonte === 'servidor' ? (resolverCitacao(item.mensagem) ?? undefined) : undefined}
                  // Só mensagens já sincronizadas (fonte==='servidor') têm
                  // id de servidor pra citar -- uma ainda só na fila local
                  // não pode ser respondida (decisão do pedido: não
                  // precisa cobrir esse caso).
                  aoResponder={item.fonte === 'servidor' ? aoTocarLongo : undefined}
                  aoIrParaOriginal={irPara}
                  destacada={destacado === item.id}
                />
              ) : (
                <BolhaSolicitacao
                  entrada={item}
                  aoResponder={item.fonte === 'servidor' ? aoTocarLongo : undefined}
                  destacada={destacado === item.id}
                />
              )
            }
            contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
            onScroll={aoRolarLista}
            scrollEventThrottle={100}
            onViewableItemsChanged={aoMudarItensVisiveis}
            viewabilityConfig={configuracaoVisibilidade}
            onScrollToIndexFailed={aoFalharScrollParaIndice}
            ListEmptyComponent={
              !carregando ? (
                <View style={styles.vazio}>
                  <Text style={styles.vazioTexto}>
                    Nenhuma solicitação ou mensagem ainda. Toque em + pra pedir algo, ou escreva abaixo.
                  </Text>
                </View>
              ) : null
            }
          />

          {dataSelo && (
            <Animated.View
              style={[styles.seloDataContainer, { opacity: opacidadeSeloData }]}
              pointerEvents="none"
            >
              <View style={styles.seloDataPilula}>
                <Text style={styles.seloDataTexto}>{dataSelo}</Text>
              </View>
            </Animated.View>
          )}
        </View>

        <BarraEntrada
          onNovaCategoria={iniciarFormulario}
          onConcluido={recarregar}
          respondendoA={respondendoA}
          aoLimparResposta={() => setRespondendoA(null)}
        />
      </KeyboardAvoidingView>

      <MenuAcoesMensagem
        visivel={menuAberto !== null}
        ponto={menuAberto?.ponto ?? null}
        itens={
          menuAberto ? [{ rotulo: '↩ Responder', aoTocar: () => setRespondendoA(menuAberto.alvo) }] : []
        }
        onFechar={() => setMenuAberto(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  areaLista: { flex: 1 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#cbd5e1' },
  divisorTexto: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  seloDataContainer: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  seloDataPilula: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  seloDataTexto: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
