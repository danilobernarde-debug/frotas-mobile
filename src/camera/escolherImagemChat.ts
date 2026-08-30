import { File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import type { ContextoMarcaDagua } from './CameraCustomizada'
import { capturarFoto } from './capturarFoto'
import { comTempoLimite } from '../lib/tempoLimite'
import { uuid } from '../lib/uuid'

const LARGURA_MAXIMA = 1600
const QUALIDADE_JPEG = 0.7
// Só pro PEDIDO de permissão da galeria -- o diálogo do sistema às vezes
// nunca aparece/nunca resolve no Expo Go (mesmo bug já documentado em
// localizacao.ts, agora com teto compartilhado). Não é usado em
// launchImageLibraryAsync logo abaixo: essa fica esperando o usuário
// escolher, um teto ali cancelaria uso normal.
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

async function comprimirFoto(uriOriginal: string): Promise<MidiaEscolhida> {
  const contexto = ImageManipulator.manipulate(uriOriginal)
  contexto.resize({ width: LARGURA_MAXIMA })
  const renderizada = await contexto.renderAsync()
  const comprimida = await renderizada.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG })

  const nome = `foto-${uuid()}.jpg`
  const destino = new File(Paths.document, nome)
  await new File(comprimida.uri).copy(destino)

  return { uri: destino.uri, nome, categoria: 'IMAGEM', mime: 'image/jpeg' }
}

/**
 * Câmera (só foto) ou galeria (foto e vídeo, estilo WhatsApp) pra anexar
 * no chat -- reaproveita capturarFoto() (mesma câmera própria do app,
 * já com compressão embutida) em vez de chamar abrirCameraCustomizada()
 * direto, pra não duplicar aquele passo aqui. `marcaDagua` é opcional:
 * quando vem preenchido (nome + localização, sem placa -- não tem
 * veículo nenhum associado a uma foto de chat), mostra a mesma faixa ao
 * vivo da câmera de abastecimento/checklist, só que puramente uma
 * prévia -- o chat não carimba nada de verdade no arquivo (ver
 * enviarAnexoMensagem em lib/api.ts), diferente daquele fluxo. Achado
 * real: manter os dois lados usando câmeras diferentes (esta usava
 * ImagePicker.launchCameraAsync antes) fazia só o lado do chat falhar em
 * silêncio -- as duas APIs de câmera (expo-camera e expo-image-picker)
 * competindo pelo hardware. Unificar resolveu.
 *
 * Vídeo (só vem da galeria) vai puro -- comprimir vídeo em client é caro
 * e a lib de imagem não serve pra isso.
 */
export async function escolherImagemChat(
  fonte: 'camera' | 'galeria',
  marcaDagua?: ContextoMarcaDagua,
): Promise<ResultadoEscolhaMidia> {
  if (fonte === 'camera') {
    // capturarFoto() já comprime e persiste (mesmo passo que a foto de
    // abastecimento/checklist usa) -- nada a mais a fazer aqui além de
    // embrulhar o resultado no formato que este módulo devolve.
    const uri = await capturarFoto(marcaDagua)
    if (!uri) return { ok: false, motivo: 'cancelado' }
    return { ok: true, midia: { uri, nome: `foto-${uuid()}.jpg`, categoria: 'IMAGEM', mime: 'image/jpeg' } }
  }

  let permissao: { granted: boolean }
  try {
    permissao = await comTempoLimite(ImagePicker.requestMediaLibraryPermissionsAsync(), TEMPO_MAXIMO_PERMISSAO_MS)
  } catch {
    // Diálogo do sistema nunca respondeu -- mesmo travamento real já
    // visto com localização, agora coberto aqui também.
    return { ok: false, motivo: 'travado' }
  }
  if (!permissao.granted) return { ok: false, motivo: 'permissao' }

  const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
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

  return { ok: true, midia: await comprimirFoto(asset.uri) }
}
