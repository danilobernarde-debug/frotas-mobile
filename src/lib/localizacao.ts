import * as Location from 'expo-location'

export interface LocalCapturado { latitude: number; longitude: number; rotulo: string | null }

// Curtos de propósito: indoor, emulador, ou GPS fraco simplesmente nunca
// conseguem um fix -- não adianta esperar muito por um dado que não vai
// chegar. Confirmado em teste real (Android): sem fix disponível,
// getCurrentPositionAsync() fica pendurado até o teto estourar, então um
// teto longo (era 8s/15s) só faz a solicitação inteira parecer travada
// bem mais tempo do que precisa.
const TEMPO_MAXIMO_POSICAO_MS = 5000
const TEMPO_MAXIMO_GEOCODIFICACAO_MS = 4000
// Teto pra função inteira, não só pras chamadas de GPS/geocodificação --
// ver o comentário em obterLocalizacaoAtual.
const TEMPO_MAXIMO_TOTAL_MS = 7000

function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error('Tempo esgotado.')), ms)
    promessa.then(
      (valor) => { clearTimeout(temporizador); resolve(valor) },
      (erro) => { clearTimeout(temporizador); reject(erro) },
    )
  })
}

async function obterLocalizacaoInterno(): Promise<LocalCapturado | null> {
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
}

/**
 * Melhor esforço do início ao fim -- inclusive contra travamento total.
 * Bug real observado: no Android, pedir permissão de localização logo
 * depois que a câmera fecha às vezes nunca faz o diálogo do sistema
 * aparecer, e requestForegroundPermissionsAsync() fica pendurado pra
 * sempre -- sem nenhum erro. Os timeouts internos (GPS, geocodificação)
 * não protegiam contra isso, só contra elas mesmas travarem. Por isso a
 * função INTEIRA tem um teto: não importa qual etapa emperrar, depois de
 * TEMPO_MAXIMO_TOTAL_MS o fluxo sempre segue em frente. Como quem chama
 * isto já dispara a busca bem antes de precisar do resultado (ver
 * useFormularioSolicitacao.ts), esse teto quase nunca é sentido pelo usuário.
 */
export async function obterLocalizacaoAtual(): Promise<LocalCapturado | null> {
  try {
    return await comTempoLimite(obterLocalizacaoInterno(), TEMPO_MAXIMO_TOTAL_MS)
  } catch {
    return null // GPS sem fix, permissão negada/travada, serviço desligado -- best-effort
  }
}
