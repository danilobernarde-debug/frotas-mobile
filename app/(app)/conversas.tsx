import { useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useEncarregadosComAtividade,
  type EncarregadoComAtividade,
} from '../../src/features/gestor/useEncarregadosComAtividade'
import { diaRelativo } from '../../src/lib/formato'
import { CabecalhoApp } from '../../src/ui/CabecalhoApp'

function CartaoEncarregado({ item, onPress }: { item: EncarregadoComAtividade; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.cartao}>
      <View style={styles.linhaTopo}>
        <Text style={styles.nome} numberOfLines={1}>
          {item.nome}
        </Text>
        <View style={styles.badges}>
          {item.categoriasPendentes.has('ABASTECIMENTO') && <Text style={styles.emoji}>⛽</Text>}
          {item.categoriasPendentes.has('MANUTENÇÃO') && <Text style={styles.emoji}>🔧</Text>}
          {item.pendentes > 0 && (
            <View style={styles.contador}>
              <Text style={styles.contadorTexto}>{item.pendentes}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.previa} numberOfLines={1}>
        💬 {item.ultimaMensagem || '—'}
      </Text>
      <Text style={styles.data}>{diaRelativo(item.ultimaMensagemEm)}</Text>
    </Pressable>
  )
}

/** Home do papel GESTOR/ADMIN -- lista de encarregados que já trocaram
 *  mensagem, cada um levando pra própria conversa (conversa/[id].tsx).
 *  Espelha frotas-web/src/app/(painel)/atividade/page.tsx. */
export default function TelaConversas() {
  const router = useRouter()
  const { itens, carregando, recarregar } = useEncarregadosComAtividade()

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <CabecalhoApp mostrarVoltar />
      <FlatList
        data={itens}
        keyExtractor={(item) => item.encarregadoId}
        renderItem={({ item }) => (
          <CartaoEncarregado
            item={item}
            onPress={() =>
              router.push({ pathname: '/(app)/conversa/[id]', params: { id: item.encarregadoId, nome: item.nome } })
            }
          />
        )}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
        ListEmptyComponent={
          !carregando ? (
            <View style={styles.vazio}>
              <Text style={styles.vazioTexto}>Nenhuma atividade ainda -- quando um encarregado escrever algo, aparece aqui.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cartao: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nome: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  emoji: { fontSize: 16 },
  contador: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  contadorTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
  previa: { fontSize: 13, color: '#334155' },
  data: { fontSize: 12, color: '#94a3b8' },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
})
