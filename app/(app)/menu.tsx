import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CabecalhoApp } from '../../src/ui/CabecalhoApp'

export default function TelaMenu() {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <CabecalhoApp />
      <View style={styles.conteudo}>
        <Pressable onPress={() => router.push('/(app)/chat')} style={styles.cartao}>
          <Text style={styles.icone}>💬</Text>
          <Text style={styles.rotulo}>Solicitações</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(app)/checklists')} style={styles.cartao}>
          <Text style={styles.icone}>☑</Text>
          <Text style={styles.rotulo}>Checklists</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  conteudo: { flex: 1, padding: 20, gap: 16, justifyContent: 'center' },
  cartao: {
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 32, alignItems: 'center', gap: 10,
  },
  icone: { fontSize: 36 },
  rotulo: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
})
