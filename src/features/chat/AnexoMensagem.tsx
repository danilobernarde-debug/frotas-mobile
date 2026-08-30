import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useState } from 'react'
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { FotoAmpliada } from '../../camera/FotoAmpliada'
import { urlAnexoMensagem } from '../../lib/api'
import { duracaoAudio, tamanhoArquivo } from '../../lib/formato'
import type { Mensagem } from '../../lib/tipos'

/**
 * Anexo dentro da bolha de uma mensagem já sincronizada -- imagem/vídeo/
 * áudio tocam inline, documento abre no visualizador do sistema,
 * localização vira link pro mapa (não é arquivo, não precisa de token).
 * Espelha AnexoMensagem de frotas-web/src/app/(painel)/atividade/thread.tsx.
 */
export function AnexoMensagem({ mensagem, minhaPropria }: { mensagem: Mensagem; minhaPropria: boolean }) {
  const { sessao } = useAuth()
  const token = sessao?.access_token
  // Só a imagem usa isto (abre em tela cheia ao tocar, estilo
  // abastecimento/checklist) -- hook fica aqui em cima, antes de
  // qualquer "return null", pra não violar a regra de hooks.
  const [ampliada, setAmpliada] = useState(false)

  if (!mensagem.anexo_tipo) return null

  if (mensagem.anexo_tipo === 'LOCALIZACAO') {
    if (mensagem.anexo_latitude == null || mensagem.anexo_longitude == null) return null
    return (
      <Pressable
        onPress={() =>
          Linking.openURL(`https://www.google.com/maps?q=${mensagem.anexo_latitude},${mensagem.anexo_longitude}`)
        }
        style={[styles.documento, minhaPropria ? styles.documentoProprio : styles.documentoOutro]}
      >
        <Text style={styles.documentoIcone}>📍</Text>
        <View>
          <Text style={[styles.documentoNome, minhaPropria && styles.documentoNomeProprio]}>
            Ver localização no mapa
          </Text>
          {/* Só coordenada aqui -- precisão é útil na hora de mandar (pra
              decidir se espera o GPS melhorar), não depois de enviada
              (pedido do usuário). */}
          <Text style={[styles.documentoTamanho, minhaPropria && styles.documentoTamanhoProprio]}>
            {mensagem.anexo_latitude.toFixed(6)}, {mensagem.anexo_longitude.toFixed(6)}
          </Text>
        </View>
      </Pressable>
    )
  }

  if (!mensagem.anexo_caminho || !token) return null
  const url = urlAnexoMensagem(mensagem.id)
  // ?token= na URL (não header) -- expo-audio/expo-video usam player
  // nativo por baixo (AVPlayer/ExoPlayer), que não tem o mesmo suporte
  // maduro a header customizado que Image/fetch já têm -- achado real:
  // áudio/vídeo não tocavam (header ignorado, servidor devolvia 401 em
  // silêncio). Mesmo truque que já era usado pra abrir documento
  // (Linking não manda header nenhum de qualquer forma).
  const urlComToken = `${url}?token=${encodeURIComponent(token)}`

  if (mensagem.anexo_tipo === 'IMAGEM') {
    return (
      <>
        <Pressable onPress={() => setAmpliada(true)}>
          <Image
            source={{ uri: url, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.imagem}
            resizeMode="cover"
          />
        </Pressable>
        <Modal visible={ampliada} animationType="fade" onRequestClose={() => setAmpliada(false)}>
          <Pressable style={styles.fundoAmpliada} onPress={() => setAmpliada(false)}>
            <FotoAmpliada uri={urlComToken} />
          </Pressable>
        </Modal>
      </>
    )
  }

  if (mensagem.anexo_tipo === 'VIDEO') {
    return <PlayerVideo url={urlComToken} />
  }

  if (mensagem.anexo_tipo === 'AUDIO') {
    return <PlayerAudio url={urlComToken} minhaPropria={minhaPropria} />
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(urlComToken)}
      style={[styles.documento, minhaPropria ? styles.documentoProprio : styles.documentoOutro]}
    >
      <Text style={styles.documentoIcone}>📄</Text>
      <View style={styles.documentoInfo}>
        <Text
          numberOfLines={1}
          style={[styles.documentoNome, minhaPropria && styles.documentoNomeProprio]}
        >
          {mensagem.anexo_nome ?? 'Documento'}
        </Text>
        {mensagem.anexo_tamanho != null && (
          <Text style={[styles.documentoTamanho, minhaPropria && styles.documentoTamanhoProprio]}>
            {tamanhoArquivo(mensagem.anexo_tamanho)}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

function PlayerVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url)
  return <VideoView player={player} style={styles.video} nativeControls contentFit="cover" />
}

function PlayerAudio({ url, minhaPropria }: { url: string; minhaPropria: boolean }) {
  const player = useAudioPlayer(url)
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
    <Pressable
      onPress={aoTocar}
      style={[styles.audio, minhaPropria ? styles.audioProprio : styles.audioOutro]}
    >
      <Text style={[styles.audioBotao, minhaPropria && styles.audioBotaoProprio]}>
        {status.playing ? '⏸' : '▶'}
      </Text>
      <View style={styles.audioBarraFundo}>
        <View
          style={[
            styles.audioBarraProgresso,
            minhaPropria && styles.audioBarraProgressoProprio,
            { width: `${status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0}%` },
          ]}
        />
      </View>
      <Text style={[styles.audioTempo, minhaPropria && styles.audioTempoProprio]}>
        {duracaoAudio(status.playing || status.currentTime > 0 ? status.currentTime : status.duration)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  imagem: { width: 220, height: 220, borderRadius: 10, marginBottom: 4 },
  // alignItems/justifyContent 'center': sem isto, o FotoAmpliada de dentro
  // (que ocupa 100% de largura mas só 85% de altura) fica ancorado no
  // topo-esquerda por padrão, deixando parte da foto empurrada fora da
  // tela em vez de centralizada -- mesmo estilo que a tela de
  // abastecimento/checklist já usa pro mesmo Modal (achado real,
  // relatado pelo usuário: "abre só que uma parte fica fora da tela").
  fundoAmpliada: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: { width: 220, height: 220, borderRadius: 10, marginBottom: 4, backgroundColor: '#000' },
  documento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  documentoOutro: { backgroundColor: 'rgba(15,23,42,0.06)' },
  documentoProprio: { backgroundColor: 'rgba(255,255,255,0.15)' },
  documentoIcone: { fontSize: 22 },
  documentoInfo: { flex: 1, minWidth: 0 },
  documentoNome: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  documentoNomeProprio: { color: '#fff' },
  documentoTamanho: { fontSize: 11, color: '#64748b', marginTop: 1 },
  documentoTamanhoProprio: { color: 'rgba(255,255,255,0.75)' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
    minWidth: 190,
  },
  audioOutro: { backgroundColor: 'rgba(15,23,42,0.06)' },
  audioProprio: { backgroundColor: 'rgba(255,255,255,0.15)' },
  audioBotao: { fontSize: 16, color: '#0f766e', width: 20, textAlign: 'center' },
  audioBotaoProprio: { color: '#fff' },
  audioBarraFundo: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(15,23,42,0.15)' },
  audioBarraProgresso: { height: 3, borderRadius: 2, backgroundColor: '#0d9488' },
  audioBarraProgressoProprio: { backgroundColor: '#fff' },
  audioTempo: { fontSize: 11, color: '#475569', minWidth: 32 },
  audioTempoProprio: { color: 'rgba(255,255,255,0.85)' },
})
