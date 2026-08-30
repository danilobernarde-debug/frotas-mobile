/**
 * Teto de tempo pra qualquer promise -- extraído de localizacao.ts, que já
 * usava isto pra se proteger de diálogos de permissão do sistema que às
 * vezes nunca aparecem/nunca resolvem no Expo Go (bug real observado ali).
 * Mesmo risco existe pra outras permissões (câmera, galeria) e telas
 * nativas (launchCameraAsync) -- por isso virou compartilhado.
 */
export function comTempoLimite<T>(promessa: Promise<T>, ms: number, mensagemErro = 'Tempo esgotado.'): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(mensagemErro)), ms)
    promessa.then(
      (valor) => {
        clearTimeout(temporizador)
        resolve(valor)
      },
      (erro) => {
        clearTimeout(temporizador)
        reject(erro)
      },
    )
  })
}
