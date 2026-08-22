import { useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../../src/auth/useAuth'
import { BarraEntrada } from '../../../src/features/chat/BarraEntrada'
import { BolhaMensagem } from '../../../src/features/chat/BolhaMensagem'
import { BolhaSolicitacao } from '../../../src/features/chat/BolhaSolicitacao'
import { ConteudoFluxo } from '../../../src/features/chat/ConteudoFluxo'
import { useFluxoSolicitacao } from '../../../src/features/chat/useFluxoSolicitacao'
import { useMinhasSolicitacoes } from '../../../src/features/chat/useMinhasSolicitacoes'
import type { CategoriaSolicitacao } from '../../../src/lib/tipos'
import { useNetworkStatus } from '../../../src/net/useNetworkStatus'
import { useSyncStatus } from '../../../src/outbox/useSyncStatus'

/** Um roteiro por vez. Isolado num componente próprio, remontado com uma
 *  `key` nova a cada início (mesmo repetindo a mesma categoria) -- é o
 *  jeito de garantir que useFluxoSolicitacao() sempre nasce do zero,
 *  nunca herda veículo/foto/descrição de uma tentativa cancelada antes. */
function SecaoFluxo({
  categoria,
  onNovaCategoria,
  onConcluido,
  onCancelar,
}: {
  categoria: CategoriaSolicitacao
  onNovaCategoria: (categoria: CategoriaSolicitacao) => void
  onConcluido: () => void
  onCancelar: () => void
}) {
  const fluxo = useFluxoSolicitacao(categoria)
  return (
    <>
      {/* "Cancelar" fica sempre visível enquanto o roteiro está aberto --
          antes só existia "Voltar", que nem aparecia no primeiro passo,
          então não tinha como sair de uma solicitação iniciada por
          engano sem preencher tudo até o fim. */}
      <View style={styles.barraFluxo}>
        {fluxo.passoAtual > 0 ? (
          <Pressable onPress={fluxo.voltar} hitSlop={10}>
            <Text style={styles.voltarTexto}>← Voltar</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={onCancelar} hitSlop={10}>
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </View>
      <ConteudoFluxo fluxo={fluxo} />
      <BarraEntrada fluxo={fluxo} onNovaCategoria={onNovaCategoria} onConcluido={onConcluido} />
    </>
  )
}

function inicial(nome: string | undefined) {
  return (nome ?? '?').trim().charAt(0).toUpperCase() || '?'
}

export default function TelaChat() {
  const { perfil, sair } = useAuth()
  const { entradas, carregando, recarregar } = useMinhasSolicitacoes()
  const { pendentes, sincronizando } = useSyncStatus()
  const conectado = useNetworkStatus()

  const [fluxoInfo, setFluxoInfo] = useState<{ categoria: CategoriaSolicitacao; chave: number } | null>(null)
  const proximaChave = useRef(0)
  // "Sair" não fica mais solto no topo (fácil de tocar sem querer) -- só
  // aparece dentro deste cartão de conta, aberto tocando no próprio nome/
  // avatar, igual perfil no WhatsApp: precisa de uma intenção clara.
  const [contaAberta, setContaAberta] = useState(false)

  function iniciarFluxo(categoria: CategoriaSolicitacao) {
    proximaChave.current += 1
    setFluxoInfo({ categoria, chave: proximaChave.current })
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <Pressable style={styles.cabecalho} onPress={() => setContaAberta(true)} hitSlop={4}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTexto}>{inicial(perfil?.nome)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>{perfil?.nome ?? 'Solicitações'}</Text>
          <Text style={styles.subtitulo}>
            {!conectado
              ? 'Sem conexão'
              : sincronizando
                ? 'Sincronizando…'
                : pendentes > 0
                  ? `${pendentes} pendente(s)`
                  : 'Tudo sincronizado'}
          </Text>
        </View>
      </Pressable>

      <Modal visible={contaAberta} transparent animationType="fade" onRequestClose={() => setContaAberta(false)}>
        <Pressable style={styles.fundoModal} onPress={() => setContaAberta(false)}>
          <View style={styles.cartaoConta}>
            <View style={[styles.avatar, styles.avatarGrande]}>
              <Text style={[styles.avatarTexto, styles.avatarTextoGrande]}>{inicial(perfil?.nome)}</Text>
            </View>
            <Text style={styles.contaNome}>{perfil?.nome}</Text>
            <Text style={styles.contaEmail}>{perfil?.email}</Text>
            <Pressable
              onPress={() => {
                setContaAberta(false)
                sair()
              }}
              style={styles.botaoSair}
            >
              <Text style={styles.botaoSairTexto}>Sair da conta</Text>
            </Pressable>
            <Pressable onPress={() => setContaAberta(false)} style={styles.botaoCancelar}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={entradas}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.tipo === 'mensagem' ? <BolhaMensagem entrada={item} /> : <BolhaSolicitacao entrada={item} />
          }
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
          ListEmptyComponent={
            !carregando && !fluxoInfo ? (
              <View style={styles.vazio}>
                <Text style={styles.vazioTexto}>
                  Nenhuma solicitação ou mensagem ainda. Toque em + pra pedir algo, ou escreva abaixo.
                </Text>
              </View>
            ) : null
          }
        />

        {fluxoInfo ? (
          <SecaoFluxo
            key={fluxoInfo.chave}
            categoria={fluxoInfo.categoria}
            onNovaCategoria={iniciarFluxo}
            onConcluido={() => {
              setFluxoInfo(null)
              recarregar()
            }}
            onCancelar={() => setFluxoInfo(null)}
          />
        ) : (
          <BarraEntrada fluxo={null} onNovaCategoria={iniciarFluxo} onConcluido={recarregar} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  titulo: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  subtitulo: { fontSize: 12, color: '#64748b', marginTop: 2 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTexto: { color: '#94a3b8', textAlign: 'center', fontSize: 14 },
  barraFluxo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  voltarTexto: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  cancelarTexto: { color: '#be123c', fontWeight: '600', fontSize: 13 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cartaoConta: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 18, padding: 24, alignItems: 'center' },
  avatarGrande: { width: 64, height: 64, borderRadius: 32, marginBottom: 12 },
  avatarTextoGrande: { fontSize: 26 },
  contaNome: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  contaEmail: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 20 },
  botaoSair: { width: '100%', backgroundColor: '#fee2e2', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  botaoSairTexto: { color: '#be123c', fontWeight: '700', fontSize: 15 },
  botaoCancelar: { marginTop: 10, paddingVertical: 8 },
  botaoCancelarTexto: { color: '#64748b', fontWeight: '600', fontSize: 14 },
})
