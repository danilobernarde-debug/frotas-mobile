import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.7

export interface MidiaEscolhida {
  uri: string
  nome: string
  categoria: 'IMAGEM' | 'VIDEO'
  mime: string
  duracaoSegundos?: number
}

/**
 * Câmera (só foto) ou galeria (foto e vídeo, estilo WhatsApp) pra anexar
 * no chat -- não é o mesmo fluxo de capturarFoto.ts (que é só câmera, pras
 * 3 fotos obrigatórias do abastecimento/manutenção, sem marca d'água
 * aqui: o chat não carimba nada, ver enviarAnexoMensagem em lib/api.ts).
 * Foto passa pela mesma compressão de sempre (reduz tamanho antes de sair
 * pra rede de campo); vídeo vai puro -- comprimir vídeo em client é caro
 * e a lib de imagem não serve pra isso.
 *
 * Devolve null se cancelar ou negar permissão.
 */
export async function escolherImagemChat(fonte: 'camera' | 'galeria'): Promise<MidiaEscolhida | null> {
  const permissao =
    fonte === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permissao.granted) return null

  const resultado =
    fonte === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
  if (resultado.canceled || !resultado.assets[0]) return null

  const asset = resultado.assets[0]

  if (asset.type === 'video') {
    const nome = `video-${uuid()}.mp4`
    const destino = new File(Paths.document, nome)
    await new File(asset.uri).copy(destino)
    return {
      uri: destino.uri,
      nome,
      categoria: 'VIDEO',
      mime: asset.mimeType || 'video/mp4',
      duracaoSegundos: asset.duration ? Math.round(asset.duration / 1000) : undefined,
    }
  }

  const contexto = ImageManipulator.manipulate(asset.uri)
  contexto.resize({ width: LARGURA_MAXIMA })
  const renderizada = await contexto.renderAsync()
  const comprimida = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG })

  const nome = `foto-${uuid()}.jpg`
  const destino = new File(Paths.document, nome)
  await new File(comprimida.uri).copy(destino)

  return { uri: destino.uri, nome, categoria: 'IMAGEM', mime: 'image/jpeg' }
}
