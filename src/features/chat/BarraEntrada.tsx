import * as DocumentPicker from 'expo-document-picker'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { escolherImagemChat } from '../../camera/escolherImagemChat'
import { duracaoAudio } from '../../lib/formato'
import { obterLocalizacaoAtual, usePrefetchLocalizacao } from '../../lib/localizacao'
import type { CategoriaAnexoUpload, CategoriaSolicitacao } from '../../lib/tipos'
import {
  TIPO_MENSAGEM,
  type AnexoMensagemPayload,
  type LocalizacaoMensagemPayload,
  type MensagemPayload,
} from '../../outbox/handlers/mensagem'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { MenuAnexo } from './MenuAnexo'
import type { RespondendoA } from './types'

type AnexoEscolhido =
  | { tipo: 'arquivo'; uriLocal: string; nomeArquivo: string; mime: string; categoria: CategoriaAnexoUpload; duracaoSegundos?: number }
  | { tipo: 'localizacao'; latitude: number; longitude: number }

/**
 * Rodapé estilo WhatsApp: "+" (MenuAnexo) reúne solicitação (abastecimento/
 * manutenção) E anexo de arquivo/localização num menu só, campo de texto
 * no meio, enviar/microfone à direita (alterna conforme tem conteúdo ou
 * não, igual BarraEntrada do painel web faz com habilitaEnviar).
 */
export function BarraEntrada({
  onNovaCategoria,
  onConcluido,
  respondendoA,
  aoLimparResposta,
}: {
  onNovaCategoria: (categoria: CategoriaSolicitacao) => void
  onConcluido: () => void
  respondendoA?: RespondendoA | null
  aoLimparResposta?: () => void
}) {
  const { perfil } = useAuth()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [anexo, setAnexo] = useState<AnexoEscolhido | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false)
  // Dispara a busca de GPS assim que o chat abre (não só quando a câmera
  // é tocada) -- dá tempo de já estar resolvido a tempo de mostrar na
  // faixa AO VIVO da câmera (marcaDaguaChat abaixo), mesmo espírito de
  // useCapturaComLocal (câmera de abastecimento/checklist).
  const localAtual = usePrefetchLocalizacao()
  const marcaDaguaChat = {
    nomeMotorista: perfil?.motoristaNome,
    latitude: localAtual?.latitude,
    longitude: localAtual?.longitude,
    localizacaoRotulo: localAtual?.rotulo ?? undefined,
  }

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const estadoGravador = useAudioRecorderState(gravador, 200)
  const gravando = estadoGravador.isRecording

  async function aoEscolherAnexo(fonte: 'camera' | 'galeria' | 'documento') {
    setErro(null)
    if (fonte === 'documento') {
      const resultado = await DocumentPicker.getDocumentAsync({ type: '*/*' })
      if (resultado.canceled || !resultado.assets[0]) return
      const doc = resultado.assets[0]
      setAnexo({
        tipo: 'arquivo',
        uriLocal: doc.uri,
        nomeArquivo: doc.name,
        mime: doc.mimeType || 'application/octet-stream',
        categoria: 'DOCUMENTO',
      })
      return
    }
    const resultado = await escolherImagemChat(fonte, fonte === 'camera' ? marcaDaguaChat : undefined)
    if (!resultado.ok) {
      if (resultado.motivo === 'permissao') {
        setErro(
          fonte === 'camera'
            ? 'Sem permissão de câmera -- ative em Ajustes/Configurações do aparelho.'
            : 'Sem permissão de fotos -- ative em Ajustes/Configurações do aparelho.',
        )
      } else if (resultado.motivo === 'travado') {
        setErro('Não consegui pedir a permissão -- feche e abra o app de novo e tente outra vez.')
      }
      return
    }
    const midia = resultado.midia
    setAnexo({
      tipo: 'arquivo',
      uriLocal: midia.uri,
      nomeArquivo: midia.nome,
      mime: midia.mime,
      categoria: midia.categoria,
      duracaoSegundos: midia.duracaoSegundos,
    })
  }

  async function aoEscolherLocalizacao() {
    setErro(null)
    setBuscandoLocalizacao(true)
    const local = await obterLocalizacaoAtual()
    setBuscandoLocalizacao(false)
    if (!local) {
      setErro('Não consegui obter sua localização -- confira o GPS/permissão do aparelho.')
      return
    }
    setAnexo({ tipo: 'localizacao', latitude: local.latitude, longitude: local.longitude })
  }

  async function iniciarGravacao() {
    setErro(null)
    const permissao = await requestRecordingPermissionsAsync()
    if (!permissao.granted) {
      setErro('Sem permissão de microfone -- confira nas configurações do aparelho.')
      return
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await gravador.prepareToRecordAsync()
      gravador.record()
    } catch {
      setErro('Não consegui começar a gravação -- tenta de novo.')
    }
  }

  async function pararGravacao() {
    const duracaoSegundos = Math.round(estadoGravador.durationMillis / 1000)
    await gravador.stop()
    const uri = gravador.uri
    if (!uri || duracaoSegundos < 1) return // gravação vazia/cancelada rápido demais -- não vira anexo
    setAnexo({
      tipo: 'arquivo',
      uriLocal: uri,
      nomeArquivo: `audio-${Date.now()}.m4a`,
      mime: 'audio/m4a',
      categoria: 'AUDIO',
      duracaoSegundos,
    })
  }

  async function aoTocarEnviar() {
    const digitado = texto.trim()
    if (!digitado && !anexo) return
    setEnviando(true)

    const anexoPayload: AnexoMensagemPayload | undefined =
      anexo?.tipo === 'arquivo'
        ? {
            uriLocal: anexo.uriLocal,
            nomeArquivo: anexo.nomeArquivo,
            mime: anexo.mime,
            categoria: anexo.categoria,
            duracaoSegundos: anexo.duracaoSegundos,
          }
        : undefined
    const localizacaoPayload: LocalizacaoMensagemPayload | undefined =
      anexo?.tipo === 'localizacao' ? { latitude: anexo.latitude, longitude: anexo.longitude } : undefined

    await enfileirar<MensagemPayload>(TIPO_MENSAGEM, {
      texto: digitado || undefined,
      anexo: anexoPayload,
      localizacao: localizacaoPayload,
      respondendoA: respondendoA?.tipo === 'mensagem' ? respondendoA.id : undefined,
      respondendoAprovacaoId: respondendoA?.tipo === 'solicitacao' ? respondendoA.id : undefined,
    })
    runSync()
    setTexto('')
    setAnexo(null)
    setEnviando(false)
    aoLimparResposta?.()
    onConcluido()
  }

  const temConteudo = texto.trim().length > 0 || anexo !== null
  const mostrarMicrofone = !temConteudo || gravando

  return (
    <View>
      {respondendoA && (
        <View style={styles.respondendoBarra}>
          <View style={styles.respondendoLinha} />
          <View style={styles.respondendoInfo}>
            <Text style={styles.respondendoAutor}>{respondendoA.titulo}</Text>
            <Text style={styles.respondendoTexto} numberOfLines={1}>
              {respondendoA.texto}
            </Text>
          </View>
          <Pressable onPress={aoLimparResposta} hitSlop={8}>
            <Text style={styles.respondendoFechar}>✕</Text>
          </Pressable>
        </View>
      )}

      {erro && <Text style={styles.erro}>{erro}</Text>}
      {buscandoLocalizacao && <Text style={styles.info}>Obtendo localização…</Text>}

      {anexo && (
        <View style={styles.previaBarra}>
          {anexo.tipo === 'localizacao' ? (
            <Text style={styles.previaTexto} numberOfLines={1}>
              📍 Localização atual selecionada
            </Text>
          ) : anexo.categoria === 'IMAGEM' ? (
            <Image source={{ uri: anexo.uriLocal }} style={styles.previaImagem} />
          ) : anexo.categoria === 'VIDEO' ? (
            <Text style={styles.previaTexto} numberOfLines={1}>
              🎬 Vídeo{anexo.duracaoSegundos != null ? ` · ${duracaoAudio(anexo.duracaoSegundos)}` : ''}
            </Text>
          ) : anexo.categoria === 'AUDIO' ? (
            <PreviaAudio uri={anexo.uriLocal} duracaoSegundos={anexo.duracaoSegundos} />
          ) : (
            <Text style={styles.previaTexto} numberOfLines={1}>
              📄 {anexo.nomeArquivo}
            </Text>
          )}
          <Pressable onPress={() => setAnexo(null)} hitSlop={8}>
            <Text style={styles.previaFechar}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.barra}>
        <MenuAnexo
          onEscolher={onNovaCategoria}
          onEscolherAnexo={aoEscolherAnexo}
          onEscolherLocalizacao={aoEscolherLocalizacao}
          desabilitado={gravando}
        />

        <TextInput
          style={styles.campo}
          value={texto}
          onChangeText={setTexto}
          placeholder={gravando ? `Gravando… ${duracaoAudio(Math.round(estadoGravador.durationMillis / 1000))}` : 'Escreva uma mensagem…'}
          placeholderTextColor="#94a3b8"
          // multiline: o campo cresce junto com o texto (até maxHeight, depois
          // rola por dentro) -- igual WhatsApp. returnKeyType="send" +
          // onSubmitEditing (versão anterior) fazia o Enter DISPARAR o envio
          // em vez de quebrar linha -- exatamente o contrário do que o
          // WhatsApp faz. Enter aqui só quebra linha; enviar é só pelo ➤.
          multiline
          returnKeyType="default"
          editable={!gravando}
        />

        {mostrarMicrofone ? (
          <Pressable
            onPress={gravando ? pararGravacao : iniciarGravacao}
            style={[styles.botaoEnviar, gravando && styles.botaoGravando]}
          >
            <Text style={styles.iconeEnviar}>{gravando ? '⏹' : '🎤'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={aoTocarEnviar}
            disabled={enviando}
            style={[styles.botaoEnviar, enviando && styles.botaoDesabilitado]}
          >
            {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.iconeEnviar}>➤</Text>}
          </Pressable>
        )}
      </View>
    </View>
  )
}

/** Player simples pra ouvir o áudio ANTES de enviar (pedido do usuário) --
 *  arquivo local, sem precisar de header de autenticação (diferente do
 *  áudio já sincronizado, servido por /api/mobile/anexo-mensagem). */
function PreviaAudio({ uri, duracaoSegundos }: { uri: string; duracaoSegundos?: number }) {
  const player = useAudioPlayer({ uri })
  const status = useAudioPlayerStatus(player)

  function aoTocar() {
    if (status.playing) {
      player.pause()
      return
    }
    if (status.currentTime >= status.duration && status.duration > 0) player.seekTo(0)
    player.play()
  }

  return (
    <Pressable onPress={aoTocar} style={styles.previaAudio}>
      <Text style={styles.previaAudioBotao}>{status.playing ? '⏸' : '▶'}</Text>
      <Text style={styles.previaTexto}>🎤 Áudio · {duracaoAudio(duracaoSegundos)}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  respondendoBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  respondendoLinha: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#0d9488' },
  respondendoInfo: { flex: 1 },
  respondendoAutor: { fontSize: 12, fontWeight: '700', color: '#0f766e' },
  respondendoTexto: { fontSize: 12, color: '#64748b' },
  respondendoFechar: { fontSize: 16, color: '#94a3b8', paddingHorizontal: 4 },
  erro: { fontSize: 12, fontWeight: '600', color: '#dc2626', paddingHorizontal: 12, paddingTop: 6 },
  info: { fontSize: 12, fontWeight: '600', color: '#64748b', paddingHorizontal: 12, paddingTop: 6 },
  previaBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  previaImagem: { width: 40, height: 40, borderRadius: 6 },
  previaTexto: { flex: 1, fontSize: 13, color: '#334155' },
  previaFechar: { fontSize: 16, color: '#94a3b8', paddingHorizontal: 6 },
  previaAudio: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  previaAudioBotao: { fontSize: 16, color: '#0f766e', width: 18, textAlign: 'center' },
  barra: {
    flexDirection: 'row',
    // flex-end (não 'center'): conforme o campo cresce com o texto, o "+"
    // e o botão de enviar ficam ancorados embaixo, igual WhatsApp -- com
    // 'center' os dois ficariam flutuando no meio da altura toda.
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  campo: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#0d9488',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    // minHeight/maxHeight (não height fixo): é isso que deixa o RN
    // crescer o campo sozinho conforme o texto quebra linha, até um teto
    // de ~5 linhas, depois passa a rolar por dentro em vez de crescer.
    minHeight: 44,
    maxHeight: 120,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoGravando: { backgroundColor: '#dc2626' },
  botaoDesabilitado: { backgroundColor: '#cbd5e1' },
  iconeEnviar: { color: '#fff', fontSize: 19, fontWeight: '700' },
})
