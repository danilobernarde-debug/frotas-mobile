import * as Location from 'expo-location'

export interface LocalCapturado { latitude: number; longitude: number; rotulo: string | null }

const TEMPO_MAXIMO_POSICAO_MS = 8000
const TEMPO_MAXIMO_GEOCODIFICACAO_MS = 5000

function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error('Tempo esgotado.')), ms)
    promessa.then(
      (valor) => { clearTimeout(temporizador); resolve(valor) },
      (erro) => { clearTimeout(temporizador); reject(erro) },
    )
  })
}

/**
 * Melhor esforço do início ao fim -- negar permissão, sem fix de GPS, ou
 * geocodificação reversa falhando nunca lança exceção, sempre volta
 * coordenadas sem rótulo ou `null`. Tarefa do encarregado não pode travar
 * por causa do carimbo de localização, por isso os dois passos têm
 * timeout próprio.
 */
export async function obterLocalizacaoAtual(): Promise<LocalCapturado | null> {
  try {
    const permissaoAtual = await Location.getForegroundPermissionsAsync()
    let concedida = permissaoAtual.granted
    if (!concedida && permissaoAtual.canAskAgain) {
      concedida = (await Location.requestForegroundPermissionsAsync()).granted
    }
    if (!concedida) return null

    const posicao = await comTempoLimite(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      TEMPO_MAXIMO_POSICAO_MS,
    )
    const { latitude, longitude } = posicao.coords

    let rotulo: string | null = null
    try {
      const enderecos = await comTempoLimite(
        Location.reverseGeocodeAsync({ latitude, longitude }),
        TEMPO_MAXIMO_GEOCODIFICACAO_MS,
      )
      const endereco = enderecos[0]
      if (endereco) {
        const cidade = endereco.city ?? endereco.subregion ?? null
        rotulo = [cidade, endereco.region].filter(Boolean).join(', ') || null
      }
    } catch {
      // sem rede pro serviço de geocodificação -- sobe só coordenada crua
    }

    return { latitude, longitude, rotulo }
  } catch {
    return null // GPS sem fix, permissão negada, serviço desligado -- best-effort
  }
}
