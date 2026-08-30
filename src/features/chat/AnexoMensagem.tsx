import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { urlAnexoMensagem } from '../../lib/api'
import { duracaoAudio, tamanhoArquivo } from '../../lib/formato'
import type { Mensagem } from '../../lib/tipos'

/**
 * Anexo dentro da bolha de uma mensagem já sincronizada -- imagem/áudio
 * tocam inline, documento abre no visualizador do sistema. Espelha
 * AnexoMensagem de frotas-web/src/app/(painel)/atividade/thread.tsx.
 */
export function AnexoMensagem({ mensagem, minhaPropria }: { mensagem: Mensagem; minhaPropria: boolean }) {
  const { sessao } = useAuth()
  const token = sessao?.access_token

  if (!mensagem.anexo_caminho || !mensagem.anexo_tipo || !token) return null
  const url = urlAnexoMensagem(mensagem.id)

  if (mensagem.anexo_tipo === 'IMAGEM') {
    return (
      <Image
        source={{ uri: url, headers: { Authorization: `Bearer ${token}` } }}
        style={styles.imagem}
        resizeMode="cover"
      />
    )
  }

  if (mensagem.anexo_tipo === 'AUDIO') {
    return <PlayerAudio url={url} token={token} minhaPropria={minhaPropria} />
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(`${url}?token=${encodeURIComponent(token)}`)}
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

function PlayerAudio({ url, token, minhaPropria }: { url: string; token: string; minhaPropria: boolean }) {
  const player = useAudioPlayer({ uri: url, headers: { Authorization: `Bearer ${token}` } })
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
