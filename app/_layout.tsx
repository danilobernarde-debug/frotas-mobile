import { setAudioModeAsync } from 'expo-audio'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../src/auth/AuthProvider'
import { CameraCustomizadaHost } from '../src/camera/CameraCustomizada'
import '../src/outbox/registrarHandlers'
import { useSyncTriggers } from '../src/outbox/useSyncTriggers'

export default function LayoutRaiz() {
  useSyncTriggers()

  // Uma vez só, pro app inteiro -- sem isto, tocar um áudio (mensagem do
  // chat) ANTES de qualquer gravação acontecer roda sob a sessão de
  // áudio padrão do iOS, que não necessariamente toca com o aparelho no
  // modo silencioso (e pode se comportar de forma inconsistente) --
  // achado real: usuário relatou áudio do chat não tocando, sem erro
  // nenhum no log (expo-audio não expõe erro de carregamento pro JS,
  // só falha em silêncio). iniciarGravacao() em BarraEntrada.tsx já
  // setava isto, mas só DEPOIS da 1ª gravação -- tarde demais pra quem
  // só quer OUVIR uma mensagem recebida.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        {/* Modal global da câmera própria do app (marca d'água ao vivo +
            flash controlável) -- ver CameraCustomizada.tsx pro porquê de
            não ser um componente comum, chamado via prop. */}
        <CameraCustomizadaHost />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
