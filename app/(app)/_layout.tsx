import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../src/auth/useAuth'

export default function LayoutApp() {
  const { sessao, perfil, carregando, sair } = useAuth()

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!sessao) return <Redirect href="/(auth)/entrar" />

  // perfil ainda não carregou (instante entre a sessão confirmar e a
  // consulta a frota_perfis voltar) -- não é "não liberado", só ainda
  // não sabe.
  if (!perfil) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
      </View>
    )
  }

  if (perfil.papel !== 'ENCARREGADO') {
    return (
      <View style={styles.centro}>
        <Text style={styles.titulo}>Conta ainda não liberada</Text>
        <Text style={styles.texto}>
          Sua conta ({perfil.nome}) ainda não foi liberada para o app de campo. Fale com o
          administrador do sistema.
        </Text>
        <Pressable onPress={sair} style={styles.botao}>
          <Text style={styles.botaoTexto}>Sair</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="menu" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="checklists" />
      <Stack.Screen name="solicitacao/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="nova-solicitacao" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  titulo: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  texto: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  botao: { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 20, height: 44, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { color: '#334155', fontWeight: '600' },
})
