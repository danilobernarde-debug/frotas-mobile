import { Directory, File, Paths } from 'expo-file-system'

const PASTA_CACHE = 'audios-chat-cache'

/**
 * Baixa (só na primeira vez) e guarda localmente o áudio de uma mensagem
 * do chat -- da segunda vez em diante toca direto do aparelho, sem
 * precisar de rede (pedido do usuário: "salvar os áudios... pra abrir mais
 * rápido"). Chave é o id da mensagem, não a URL (que carrega um `?token=`
 * que muda a cada sessão) -- assim o cache continua valendo depois de
 * logout/login de novo.
 */
export async function obterAudioCacheado(mensagemId: number, urlRemota: string): Promise<string> {
  const pasta = new Directory(Paths.cache, PASTA_CACHE)
  if (!pasta.exists) pasta.create()

  const arquivoLocal = new File(pasta, `${mensagemId}.m4a`)
  if (arquivoLocal.exists) return arquivoLocal.uri

  try {
    const baixado = await File.downloadFileAsync(urlRemota, arquivoLocal)
    return baixado.uri
  } catch {
    // Sem rede, ou falhou o download -- toca direto da URL remota como
    // antes (se a rede estiver realmente fora, o player vai falhar do
    // mesmo jeito que falharia sem cache nenhum).
    return urlRemota
  }
}
