import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../src/auth/AuthProvider'
import { CameraCustomizadaHost } from '../src/camera/CameraCustomizada'
import '../src/outbox/registrarHandlers'
import { useSyncTriggers } from '../src/outbox/useSyncTriggers'

export default function LayoutRaiz() {
  useSyncTriggers()

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
