import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../auth/useAuth'

function inicial(nome: string | undefined) {
  return (nome ?? '?').trim().charAt(0).toUpperCase() || '?'
}

/**
 * Cabeçalho compartilhado por chat.tsx e checklists/index.tsx -- extraído
 * de dentro de chat.tsx (onde só ele existia antes) pra ganhar um botão de
 * voltar opcional, já que agora as duas telas moram fora de um menu de
 * abas fixo.
 */
export function CabecalhoApp({
  mostrarVoltar,
  subtitulo,
  subtituloErro,
}: {
  mostrarVoltar?: boolean
  subtitulo?: string
  /** true deixa o subtítulo em vermelho -- usado quando ele é uma
   *  mensagem de erro (ex.: falha ao enviar foto), não o status normal
   *  de sincronização. */
  subtituloErro?: boolean
}) {
  const { perfil, sair } = useAuth()
  const router = useRouter()
  const [contaAberta, setContaAberta] = useState(false)

  return (
    <>
      <View style={styles.cabecalho}>
        {mostrarVoltar && (
          <Pressable onPress={() => router.push('/(app)/menu')} hitSlop={10} style={styles.botaoVoltar}>
            <Text style={styles.iconeVoltar}>←</Text>
          </Pressable>
        )}
        <Pressable style={styles.identidade} onPress={() => setContaAberta(true)} hitSlop={4}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>{inicial(perfil?.nome)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{perfil?.nome ?? 'Frotas'}</Text>
            {subtitulo && (
              <Text style={[styles.subtitulo, subtituloErro && styles.subtituloErro]} numberOfLines={2}>
                {subtitulo}
              </Text>
            )}
          </View>
        </Pressable>
      </View>

      <Modal visible={contaAberta} transparent animationType="fade" onRequestClose={() => setContaAberta(false)}>
        <Pressable style={styles.fundoModal} onPress={() => setContaAberta(false)}>
          <View style={styles.cartaoConta}>
            <View style={[styles.avatar, styles.avatarGrande]}>
              <Text style={[styles.avatarTexto, styles.avatarTextoGrande]}>{inicial(perfil?.nome)}</Text>
            </View>
            <Text style={styles.contaNome}>{perfil?.nome}</Text>
            <Text style={styles.contaEmail}>{perfil?.email}</Text>
            <Pressable onPress={() => { setContaAberta(false); sair() }} style={styles.botaoSair}>
              <Text style={styles.botaoSairTexto}>Sair da conta</Text>
            </Pressable>
            <Pressable onPress={() => setContaAberta(false)} style={styles.botaoCancelar}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  botaoVoltar: { padding: 6 },
  iconeVoltar: { fontSize: 22, color: '#0f172a', fontWeight: '600' },
  identidade: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0d9488', alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  titulo: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  subtitulo: { fontSize: 12, color: '#64748b', marginTop: 2 },
  subtituloErro: { color: '#be123c', fontWeight: '600' },
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
