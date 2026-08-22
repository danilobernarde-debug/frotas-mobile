import { useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { data as fmtData } from '../../../../src/lib/formato'
import { useMeusChecklists, type EntradaChecklist } from '../../../../src/features/checklists/useMeusChecklists'

function ItemChecklist({ entrada }: { entrada: EntradaChecklist }) {
  if (entrada.fonte === 'servidor') {
    const c = entrada.checklist
    return (
      <View style={styles.item}>
        <Text style={styles.itemVeiculo}>{c.veiculo?.placa ?? '—'}</Text>
        <Text style={styles.itemData}>{fmtData(c.data_hora)}</Text>
        <View style={[styles.badge, styles.badgeOk]}>
          <Text style={styles.badgeTexto}>Enviado</Text>
        </View>
      </View>
    )
  }

  const enviando = entrada.item.status === 'enviando'
  const erro = entrada.item.permanente
  return (
    <View style={styles.item}>
      <Text style={styles.itemVeiculo}>Checklist em andamento</Text>
      <Text style={styles.itemData}>{fmtData(entrada.criadoEm)}</Text>
      <View style={[styles.badge, erro ? styles.badgeErro : styles.badgeLocal]}>
        <Text style={styles.badgeTexto}>{erro ? 'Não foi possível enviar' : enviando ? 'Enviando…' : 'Aguardando envio'}</Text>
      </View>
    </View>
  )
}

export default function TelaChecklists() {
  const router = useRouter()
  const { entradas, carregando, recarregar } = useMeusChecklists()

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Checklists</Text>
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/checklists/novo')}
          style={styles.botaoNovo}
        >
          <Text style={styles.botaoNovoTexto}>+ Novo</Text>
        </Pressable>
      </View>

      <FlatList
        data={entradas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemChecklist entrada={item} />}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
        ListEmptyComponent={
          !carregando ? (
            <View style={styles.vazio}>
              <Text style={styles.vazioTexto}>Nenhum checklist enviado ainda.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  titulo: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  botaoNovo: { backgroundColor: '#0d9488', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  botaoNovoTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  itemVeiculo: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  itemData: { fontSize: 13, color: '#64748b' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  badgeOk: { backgroundColor: '#d1fae5' },
  badgeLocal: { backgroundColor: '#e2e8f0' },
  badgeErro: { backgroundColor: '#fee2e2' },
  badgeTexto: { fontSize: 12, fontWeight: '700', color: '#334155' },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', fontSize: 14 },
})
