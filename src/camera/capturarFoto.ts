import { File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { abrirCameraCustomizada, type ContextoMarcaDagua } from './CameraCustomizada'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.65

/**
 * Abre a câmera própria do app (CameraCustomizada.tsx -- não mais a
 * câmera do sistema: só assim dá pra mostrar a marca d'água ao vivo por
 * cima do visor e abrir sempre com flash desligado, pedidos do usuário),
 * comprime o resultado (normaliza HEIC pra JPEG e reduz o tamanho -- fica
 * bem abaixo do limite de 4.5MB da função serverless da Vercel) e copia
 * pra `documentDirectory`, que é persistente. O resultado de
 * ImageManipulator.saveAsync() fica em cache, que o SO pode limpar
 * enquanto a foto ainda espera sincronizar -- por isso a cópia.
 *
 * `marcaDagua` (opcional) alimenta a prévia mostrada ao vivo no visor --
 * quem chama já tem motorista/placa em mãos (useFormularioSolicitacao,
 * checklists/novo.tsx), então passar aqui é só encaminhar. Sem marca
 * d'água nenhuma se omitido (a tela de câmera simplesmente não desenha a
 * faixa).
 *
 * Devolve null se o usuário cancelar ou negar a permissão de câmera.
 */
export async function capturarFoto(marcaDagua?: ContextoMarcaDagua): Promise<string | null> {
  const uriCapturada = await abrirCameraCustomizada(marcaDagua)
  if (!uriCapturada) return null

  const contexto = ImageManipulator.manipulate(uriCapturada)
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
