import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { isRunningInExpoGo } from 'expo'
import { Platform } from 'react-native'
import { supabase } from './supabase'

/**
 * `expo-notifications` NÃO pode ser importado no topo deste arquivo.
 *
 * A partir do SDK 55, push remoto no Expo Go deixou de ser um aviso e
 * virou exceção: só de carregar o módulo, ele roda
 * PushTokenAutoRegistration.fx -> warnOfExpoGoPushUsage(), que faz
 * `throw` quando está no Expo Go **no Android** (no iOS só avisa -- ver
 * node_modules/expo-notifications/build/warnOfExpoGoPushUsage.js). Com o
 * import estático de antes, isso derrubava o app inteiro na abertura,
 * antes de qualquer tela renderizar.
 *
 * Por isso o require é preguiçoso e guardado por isRunningInExpoGo():
 * no Expo Go nada de push é carregado (e o app roda normal, só sem
 * notificação); no build de verdade -- que é onde push funciona --
 * carrega igual a antes.
 */
type ModuloNotificacoes = typeof import('expo-notifications')

let modulo: ModuloNotificacoes | null | undefined

function obterNotificacoes(): ModuloNotificacoes | null {
  if (modulo !== undefined) return modulo
  if (isRunningInExpoGo()) {
    modulo = null
    return null
  }

  const carregado = require('expo-notifications') as ModuloNotificacoes
  // Ficava no topo do arquivo; veio junto pra cá pelo mesmo motivo --
  // roda uma vez só, na primeira vez que alguém precisa do módulo.
  carregado.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
  modulo = carregado
  return carregado
}

const CANAL_PADRAO = 'padrao'

/** Dados que o servidor manda no payload da notificação (ver
 *  0035_notificacao_push.sql). */
export interface DadosNotificacao {
  tipo?: 'mensagem' | 'solicitacao'
  encarregadoId?: string
  aprovacaoId?: number
}

/**
 * Pede permissão, pega o Expo push token deste aparelho e salva no
 * perfil -- chamado de app/(app)/_layout.tsx assim que perfil.id fica
 * disponível.
 *
 * Só Android por enquanto -- iOS exige a Apple Developer Program (conta
 * paga da Apple, decisão de escopo do usuário: começar só por Android,
 * que não exige isso). Quando/se a conta da Apple existir, tirar o
 * `Platform.OS !== 'android'` abaixo é o suficiente pro lado do app (o
 * envio do servidor também vai precisar aprender a mandar pro token de
 * iOS, mas o formato do Expo push token é o mesmo nas duas plataformas).
 *
 * Silencioso em qualquer falha (emulador sem Google Play Services,
 * permissão negada, Expo Go sem suporte a push remoto) -- notificação é
 * um extra, não pode travar o login de ninguém.
 */
export async function registrarPushToken(perfilId: string) {
  if (Platform.OS !== 'android') return
  if (!Device.isDevice) return

  const Notifications = obterNotificacoes()
  if (!Notifications) return

  try {
    await Notifications.setNotificationChannelAsync(CANAL_PADRAO, {
      name: 'Frotas',
      importance: Notifications.AndroidImportance.HIGH,
    })

    const permissaoAtual = await Notifications.getPermissionsAsync()
    let status = permissaoAtual.status
    if (status !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync()
      status = pedido.status
    }
    if (status !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) return
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

    await supabase.from('frota_perfis').update({ push_token: token }).eq('id', perfilId)
  } catch {
    // sem push -- não impede o resto do app de funcionar
  }
}

/**
 * Avisa quando o usuário TOCA numa notificação, pra abrir a tela certa.
 * Cobre os dois casos: app fechado (cold start, via
 * getLastNotificationResponseAsync) e app em segundo plano/aberto (via
 * listener). Devolve a função de limpeza pro useEffect de quem chama.
 *
 * Mora aqui, e não em _layout.tsx como antes, pra manter o import de
 * `expo-notifications` inteiro dentro deste módulo -- ver o comentário
 * grande no topo. No Expo Go não faz nada.
 */
export function assinarRespostaNotificacao(
  aoTocar: (dados: DadosNotificacao) => void,
): () => void {
  const Notifications = obterNotificacoes()
  if (!Notifications) return () => {}

  Notifications.getLastNotificationResponseAsync().then((resposta) => {
    if (resposta) aoTocar(resposta.notification.request.content.data as DadosNotificacao)
  })
  const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) =>
    aoTocar(resposta.notification.request.content.data as DadosNotificacao),
  )
  return () => assinatura.remove()
}
