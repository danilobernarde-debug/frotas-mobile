import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../../src/auth/useAuth'
import { BolhaSolicitacao } from '../../../src/features/chat/BolhaSolicitacao'
import { MenuAnexo } from '../../../src/features/chat/MenuAnexo'
import { NovaSolicitacaoFluxo } from '../../../src/features/chat/NovaSolicitacaoFluxo'
import { useMinhasSolicitacoes } from '../../../src/features/chat/useMinhasSolicitacoes'
import type { CategoriaSolicitacao } from '../../../src/lib/tipos'
import { useNetworkStatus } from '../../../src/net/useNetworkStatus'
import { useSyncStatus } from '../../../src/outbox/useSyncStatus'

export default function TelaChat() {
  const { perfil, sair } = useAuth()
  const { entradas, carregando, recarregar } = useMinhasSolicitacoes()
  const { pendentes, sincronizando } = useSyncStatus()
  const conectado = useNetworkStatus()
  const [categoriaAtiva, setCategoriaAtiva] = useState<CategoriaSolicitacao | null>(null)

  if (categoriaAtiva) {
    return (
      <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
        <NovaSolicitacaoFluxo
          categoria={categoriaAtiva}
          aoCancelar={() => setCategoriaAtiva(null)}
          aoConcluir={() => {
            setCategoriaAtiva(null)
            recarregar()
          }}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.cabecalho}>
        <View>
          <Text style={styles.titulo}>{perfil?.nome ?? 'Solicitações'}</Text>
          <Text style={styles.subtitulo}>
            {!conectado ? 'Sem conexão' : sincronizando ? 'Sincronizando…' : pendentes > 0 ? `${pendentes} pendente(s)` : 'Tudo sincronizado'}
          </Text>
        </View>
        <Pressable onPress={sair} hitSlop={10}>
          <Text style={styles.sair}>Sair</Text>
        </Pressable>
      </View>

      <FlatList
        data={entradas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BolhaSolicitacao entrada={item} />}
        contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
        ListEmptyComponent={
          !carregando ? (
            <View style={styles.vazio}>
              <Text style={styles.vazioTexto}>Nenhuma solicitação ainda. Toque em + pra começar.</Text>
            </View>
          ) : null
        }
      />

      <View style={styles.rodape}>
        <MenuAnexo onEscolher={setCategoriaAtiva} />
      </View>
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
  subtitulo: { fontSize: 12, color: '#64748b', marginTop: 2 },
  sair: { color: '#be123c', fontWeight: '600', fontSize: 14 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
})
