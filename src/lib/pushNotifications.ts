import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

const CANAL_PADRAO = 'padrao'

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
