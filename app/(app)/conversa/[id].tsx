import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewToken,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../../src/auth/useAuth'
import { BarraEntrada } from '../../../src/features/chat/BarraEntrada'
import { BolhaMensagem } from '../../../src/features/chat/BolhaMensagem'
import { BolhaSolicitacao, ROTULO_CATEGORIA } from '../../../src/features/chat/BolhaSolicitacao'
import { compartilharAnexo } from '../../../src/features/chat/compartilharAnexo'
import { inserirDivisoresData } from '../../../src/features/chat/divisoresData'
import { MenuAcoesMensagem, type ItemMenuAcao } from '../../../src/features/chat/MenuAcoesMensagem'
import { previaMensagem } from '../../../src/features/chat/textoMensagem'
import type { EntradaChat, RespondendoA } from '../../../src/features/chat/types'
import { useMinhasSolicitacoes } from '../../../src/features/chat/useMinhasSolicitacoes'
import { urlAnexoMensagem } from '../../../src/lib/api'
import { diaRelativo } from '../../../src/lib/formato'
import type { Aprovacao, Mensagem } from '../../../src/lib/tipos'

const NOMES_ANEXO: Record<'IMAGEM' | 'VIDEO' | 'AUDIO', string> = {
  IMAGEM: 'foto.jpg',
  VIDEO: 'video.mp4',
  AUDIO: 'audio.m4a',
}

const TEMPO_VISIVEL_SELO_DATA_MS = 1200

/**
 * Conversa de UM encarregado específico, vista por GESTOR/ADMIN --
 * praticamente uma cópia de app/(app)/chat.tsx (mesmos componentes de
 * bolha, mesmo truque de FlatList invertida pra abrir já no fim), só que
 * `id` vem da rota em vez de ser sempre perfil.id, e:
 * - sem "solicitar abastecimento/manutenção" (só o próprio encarregado
 *   pede pra si -- ver mostrarSolicitacao/onNovaCategoria ausente em
 *   MenuAnexo/BarraEntrada);
 * - sem o divisor "Mensagens não lidas" (useDivisorNaoLidas usa UMA chave
 *   global de AsyncStorage -- correto pra "minha única conversa", mas
 *   marcaria errado ao alternar entre vários encarregados diferentes).
 * BolhaMensagem/citação já rotulam o autor certo sozinhas (usam
 * `autor?.nome` do join, não um rótulo fixo "Gestão de frotas") -- não
 * precisou de mudança nelas.
 */
export default function TelaConversaEncarregado() {
  const params = useLocalSearchParams<{ id: string; nome?: string }>()
  const encarregadoId = params.id
  const router = useRouter()
  const { perfil, sessao } = useAuth()
  const { entradas, carregando, recarregar } = useMinhasSolicitacoes(encarregadoId)
  const entradasComDivisor = useMemo(() => inserirDivisoresData(entradas), [entradas])
  const entradasInvertidas = useMemo(() => [...entradasComDivisor].reverse(), [entradasComDivisor])

  const [respondendoA, setRespondendoA] = useState<RespondendoA | null>(null)
  const [menuAberto, setMenuAberto] = useState<{
    alvo: RespondendoA
    ponto: { x: number; y: number }
    mensagem?: Mensagem
  } | null>(null)
  const [destacado, setDestacado] = useState<string | null>(null)
  const timeoutDestaque = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mensagensPorId = new Map<number, Mensagem>()
  const aprovacoesPorId = new Map<number, Aprovacao>()
  for (const e of entradas) {
    if (e.tipo === 'mensagem' && e.fonte === 'servidor') mensagensPorId.set(e.mensagem.id, e.mensagem)
    if (e.tipo === 'solicitacao' && e.fonte === 'servidor') aprovacoesPorId.set(e.aprovacao.id, e.aprovacao)
  }

  function resolverCitacao(m: Mensagem): { titulo: string; texto: string; alvoId: string } | null {
    if (m.respondendo_a != null) {
      const citada = mensagensPorId.get(m.respondendo_a)
      if (!citada) return null
      const nomeCitado = citada.autor_id === perfil?.id ? (perfil?.nome ?? 'Você') : (citada.autor?.nome ?? 'Gestão de frotas')
      return { titulo: nomeCitado, texto: previaMensagem(citada), alvoId: `servidor-msg-${citada.id}` }
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

  useFocusEffect(
    useCallback(() => {
      recarregar()
    }, [recarregar]),
  )

  function irPara(alvoId: string) {
    const indice = entradasInvertidas.findIndex((e) => e.id === alvoId)
    if (indice === -1) return
    listaRef.current?.scrollToIndex({ index: indice, animated: true })
    destacar(alvoId)
  }

  function aoTocarLongo(alvo: RespondendoA, evento: GestureResponderEvent, mensagem?: Mensagem) {
    const { pageX, pageY } = evento.nativeEvent
    setMenuAberto({ alvo, ponto: { x: pageX, y: pageY }, mensagem })
  }

  function itensDoMenu(alvo: RespondendoA, mensagem?: Mensagem): ItemMenuAcao[] {
    const itens: ItemMenuAcao[] = [{ rotulo: '↩ Responder', aoTocar: () => setRespondendoA(alvo) }]

    if (mensagem?.texto) {
      itens.push({ rotulo: '📋 Copiar', aoTocar: () => Clipboard.setString(mensagem.texto ?? '') })
    }

    const tipo = mensagem?.anexo_tipo
    if (mensagem && tipo && tipo !== 'LOCALIZACAO' && mensagem.anexo_caminho) {
      itens.push({
        rotulo: '📤 Compartilhar',
        aoTocar: () => {
          const token = sessao?.access_token
          if (!token) return
          const url = `${urlAnexoMensagem(mensagem.id)}?token=${encodeURIComponent(token)}`
          const nome = tipo === 'DOCUMENTO' ? (mensagem.anexo_nome ?? 'documento') : NOMES_ANEXO[tipo]
          compartilharAnexo(url, nome).catch(() =>
            Alert.alert('Não consegui compartilhar', 'Tenta de novo em alguns segundos.'),
          )
        },
      })
    }

    return itens
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

  const [dataSelo, setDataSelo] = useState<string | null>(null)
  const opacidadeSeloData = useRef(new Animated.Value(0)).current
  const timeoutSeloData = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aoMudarItensVisiveis = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return
    const doTopo = viewableItems.reduce((maisAlto, v) => ((v.index ?? -1) > (maisAlto.index ?? -1) ? v : maisAlto))
    const item = doTopo.item as EntradaChat
    setDataSelo(item.tipo === 'divisor' ? item.rotulo : diaRelativo(item.criadoEm))
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

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      {/* Cabeçalho próprio (não CabecalhoApp, que mostra o nome de quem
          está logado -- aqui precisa mostrar o nome de quem está sendo
          visto). Mesmo motivo de solicitacao/[id].tsx pro cabeçalho ser
          na mão, não o nativo do Stack: safe area no Android. */}
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Text style={styles.iconeVoltar}>←</Text>
        </Pressable>
        <Text style={styles.tituloCabecalho} numberOfLines={1}>
          {params.nome ?? 'Conversa'}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.areaLista}>
          <FlatList
            ref={listaRef}
            inverted
            data={entradasInvertidas}
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
                <View style={[styles.vazio, styles.vazioInvertido]}>
                  <Text style={styles.vazioTexto}>Nenhuma solicitação ou mensagem ainda.</Text>
                </View>
              ) : null
            }
          />

          {dataSelo && (
            <Animated.View style={[styles.seloDataContainer, { opacity: opacidadeSeloData }]} pointerEvents="none">
              <View style={styles.seloDataPilula}>
                <Text style={styles.seloDataTexto}>{dataSelo}</Text>
              </View>
            </Animated.View>
          )}
        </View>

        <BarraEntrada
          encarregadoId={encarregadoId}
          onConcluido={recarregar}
          respondendoA={respondendoA}
          aoLimparResposta={() => setRespondendoA(null)}
        />
      </KeyboardAvoidingView>

      <MenuAcoesMensagem
        visivel={menuAberto !== null}
        ponto={menuAberto?.ponto ?? null}
        itens={menuAberto ? itensDoMenu(menuAberto.alvo, menuAberto.mensagem) : []}
        onFechar={() => setMenuAberto(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  botaoVoltar: { padding: 6 },
  iconeVoltar: { fontSize: 22, color: '#0f172a', fontWeight: '600' },
  tituloCabecalho: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0f172a' },
  areaLista: { flex: 1 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioInvertido: { transform: [{ scaleY: -1 }] },
  vazioTexto: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#cbd5e1' },
  divisorTexto: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  seloDataContainer: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  seloDataPilula: { backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  seloDataTexto: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
