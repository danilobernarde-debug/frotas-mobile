import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { comTempoLimite } from '../lib/tempoLimite'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.7
// Só pro PEDIDO de permissão -- o diálogo do sistema às vezes nunca
// aparece/nunca resolve no Expo Go (mesmo bug já documentado em
// localizacao.ts, agora com teto compartilhado). Não é usado nas chamadas
// de launchCameraAsync/launchImageLibraryAsync logo abaixo: essas ficam
// esperando o usuário de propósito (pode levar bem mais que isso pra
// enquadrar uma foto), um teto ali cancelaria uso normal.
const TEMPO_MAXIMO_PERMISSAO_MS = 10_000

export interface MidiaEscolhida {
  uri: string
  nome: string
  categoria: 'IMAGEM' | 'VIDEO'
  mime: string
  duracaoSegundos?: number
}

/** Distingue "sem permissão" de "cancelou"/"travou" -- todos voltavam
 *  como null antes, sem jeito da tela avisar por que nada foi escolhido
 *  (achado real: usuário toca em Câmera, permissão já tinha sido negada
 *  antes, e a tela ficava muda -- parecia que o botão não fazia nada). */
export type ResultadoEscolhaMidia =
  | { ok: true; midia: MidiaEscolhida }
  | { ok: false; motivo: 'permissao' | 'cancelado' | 'travado' }

/**
 * Câmera (só foto) ou galeria (foto e vídeo, estilo WhatsApp) pra anexar
 * no chat -- não é o mesmo fluxo de capturarFoto.ts (que é só câmera, pras
 * 3 fotos obrigatórias do abastecimento/manutenção, sem marca d'água
 * aqui: o chat não carimba nada, ver enviarAnexoMensagem em lib/api.ts).
 * Foto passa pela mesma compressão de sempre (reduz tamanho antes de sair
 * pra rede de campo); vídeo vai puro -- comprimir vídeo em client é caro
 * e a lib de imagem não serve pra isso.
 */
export async function escolherImagemChat(fonte: 'camera' | 'galeria'): Promise<ResultadoEscolhaMidia> {
  let permissao: { granted: boolean }
  try {
    permissao = await comTempoLimite(
      fonte === 'camera'
        ? ImagePicker.requestCameraPermissionsAsync()
        : ImagePicker.requestMediaLibraryPermissionsAsync(),
      TEMPO_MAXIMO_PERMISSAO_MS,
    )
  } catch {
    // Diálogo do sistema nunca respondeu -- mesmo travamento real já
    // visto com localização, agora coberto aqui também.
    return { ok: false, motivo: 'travado' }
  }
  if (!permissao.granted) return { ok: false, motivo: 'permissao' }

  const resultado =
    fonte === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
  if (resultado.canceled || !resultado.assets[0]) return { ok: false, motivo: 'cancelado' }

  const asset = resultado.assets[0]

  if (asset.type === 'video') {
    const nome = `video-${uuid()}.mp4`
    const destino = new File(Paths.document, nome)
    await new File(asset.uri).copy(destino)
    return {
      ok: true,
      midia: {
        uri: destino.uri,
        nome,
        categoria: 'VIDEO',
        mime: asset.mimeType || 'video/mp4',
        duracaoSegundos: asset.duration ? Math.round(asset.duration / 1000) : undefined,
      },
    }
  }

  const contexto = ImageManipulator.manipulate(asset.uri)
  contexto.resize({ width: LARGURA_MAXIMA })
  const renderizada = await contexto.renderAsync()
  const comprimida = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG })

  const nome = `foto-${uuid()}.jpg`
  const destino = new File(Paths.document, nome)
  await new File(comprimida.uri).copy(destino)

  return { ok: true, midia: { uri: destino.uri, nome, categoria: 'IMAGEM', mime: 'image/jpeg' } }
}
