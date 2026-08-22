import { Link, Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function NaoEncontrado() {
  return (
    <>
      <Stack.Screen options={{ title: 'Não encontrado' }} />
      <View style={styles.container}>
        <Text style={styles.texto}>Esta tela não existe.</Text>
        <Link href="/(app)/(tabs)/chat" style={styles.link}>
          Voltar pro início
        </Link>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  texto: { fontSize: 16, color: '#334155' },
  link: { color: '#0d9488', fontWeight: '700' },
})
