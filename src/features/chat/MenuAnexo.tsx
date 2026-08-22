import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { CategoriaSolicitacao } from '../../lib/tipos'

/** Lista extensível de propósito -- uma 3ª opção no futuro é só somar um
 *  item aqui, sem mexer no resto do menu. */
const OPCOES: { categoria: CategoriaSolicitacao; icone: string; rotulo: string }[] = [
  { categoria: 'ABASTECIMENTO', icone: '⛽', rotulo: 'Abastecimento' },
  { categoria: 'MANUTENÇÃO', icone: '🔧', rotulo: 'Manutenção' },
]

export function MenuAnexo({ onEscolher }: { onEscolher: (categoria: CategoriaSolicitacao) => void }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        style={({ pressed }) => [styles.botao, pressed && styles.botaoPressionado]}
        accessibilityLabel="Nova solicitação"
      >
        <Text style={styles.botaoTexto}>+</Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <View style={styles.folha}>
            <Text style={styles.titulo}>O que você quer solicitar?</Text>
            {OPCOES.map((opcao) => (
              <Pressable
                key={opcao.categoria}
                onPress={() => {
                  setAberto(false)
                  onEscolher(opcao.categoria)
                }}
                style={({ pressed }) => [styles.opcao, pressed && styles.opcaoPressionada]}
              >
                <Text style={styles.opcaoIcone}>{opcao.icone}</Text>
                <Text style={styles.opcaoTexto}>{opcao.rotulo}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  botao: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPressionado: { opacity: 0.8 },
  botaoTexto: { color: '#fff', fontSize: 26, fontWeight: '400', marginTop: -2 },
  fundo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  folha: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  titulo: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 14, textAlign: 'center' },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  opcaoPressionada: { backgroundColor: '#f1f5f9' },
  opcaoIcone: { fontSize: 24 },
  opcaoTexto: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
})
