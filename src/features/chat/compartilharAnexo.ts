import { Directory, File, Paths } from 'expo-file-system'
import { Share } from 'react-native'

/**
 * Baixa o anexo (a URL já vem com ?token= -- ver AnexoMensagem.tsx) pra um
 * arquivo local e abre o menu de compartilhar do sistema -- é preciso
 * baixar primeiro porque o menu de compartilhar do RN só sabe lidar com
 * arquivo local de verdade, não uma URL remota que exige login.
 *
 * `nomeArquivo` decide o nome final (com extensão) -- sem isso o arquivo
 * baixado herdaria só o id da mensagem como nome (a rota serve por id, não
 * por nome), e o app que recebe (WhatsApp, Fotos, etc.) não saberia que
 * tipo de arquivo é.
 */
export async function compartilharAnexo(url: string, nomeArquivo: string): Promise<void> {
  const pasta = new Directory(Paths.cache, 'compartilhar')
  if (!pasta.exists) pasta.create()

  const destino = new File(pasta, nomeArquivo)
  if (destino.exists) destino.delete() // resto de um compartilhamento anterior do mesmo anexo

  const arquivoBaixado = await File.downloadFileAsync(url, destino)
  await Share.share({ url: arquivoBaixado.uri })
}
