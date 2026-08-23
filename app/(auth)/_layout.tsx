import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../src/auth/useAuth'

export default function LayoutAuth() {
  const { sessao, carregando } = useAuth()

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (sessao) return <Redirect href="/(app)/menu" />

  return <Stack screenOptions={{ headerShown: false }} />
}
