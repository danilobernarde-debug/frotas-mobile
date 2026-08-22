import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.65

/**
 * Abre a câmera, comprime o resultado (normaliza HEIC pra JPEG e reduz o
 * tamanho -- fica bem abaixo do limite de 4.5MB da função serverless da
 * Vercel) e copia pra `documentDirectory`, que é persistente. O resultado
 * de ImageManipulator.saveAsync() fica em cache, que o SO pode limpar
 * enquanto a foto ainda espera sincronizar -- por isso a cópia.
 *
 * Devolve null se o usuário cancelar ou negar a permissão de câmera.
 */
export async function capturarFoto(): Promise<string | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync()
  if (!permissao.granted) return null

  const resultado = await ImagePicker.launchCameraAsync({ quality: 1 })
  if (resultado.canceled || !resultado.assets[0]) return null

  const contexto = ImageManipulator.manipulate(resultado.assets[0].uri)
  contexto.resize({ width: LARGURA_MAXIMA })
  const renderizada = await contexto.renderAsync()
  const comprimida = await renderizada.saveAsync({
    format: SaveFormat.JPEG,
    compress: QUALIDADE_JPEG,
  })

  const destino = new File(Paths.document, `${uuid()}.jpg`)
  await new File(comprimida.uri).copy(destino)

  return destino.uri
}

/** Apaga a cópia local depois que a foto já está confirmada no servidor
 *  (Google Drive) -- não precisa mais ocupar espaço no aparelho. */
export function removerFotoLocal(uri: string) {
  try {
    new File(uri).delete()
  } catch {
    // já removida ou uri inválida -- não é motivo pra falhar o que chamou.
  }
}
