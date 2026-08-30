import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.7

/**
 * Câmera ou galeria pra anexar no chat -- não é o mesmo fluxo de
 * capturarFoto.ts (que é só câmera, pras 3 fotos obrigatórias do
 * abastecimento/manutenção, sem marca d'água aqui: o chat não carimba
 * nada, ver enviarAnexoMensagem em lib/api.ts). Mesma compressão (reduz
 * tamanho antes de sair pra rede de campo), mas com fonte escolhida pelo
 * usuário.
 *
 * Devolve null se cancelar ou negar permissão.
 */
export async function escolherImagemChat(
  fonte: 'camera' | 'galeria',
): Promise<{ uri: string; nome: string } | null> {
  const permissao =
    fonte === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permissao.granted) return null

  const resultado =
    fonte === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
  if (resultado.canceled || !resultado.assets[0]) return null

  const contexto = ImageManipulator.manipulate(resultado.assets[0].uri)
  contexto.resize({ width: LARGURA_MAXIMA })
  const renderizada = await contexto.renderAsync()
  const comprimida = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG })

  const nome = `foto-${uuid()}.jpg`
  const destino = new File(Paths.document, nome)
  await new File(comprimida.uri).copy(destino)

  return { uri: destino.uri, nome }
}
