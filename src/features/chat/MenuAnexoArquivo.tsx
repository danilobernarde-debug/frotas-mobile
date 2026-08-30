import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

const OPCOES = [
  { chave: 'camera' as const, icone: '📷', rotulo: 'Câmera' },
  { chave: 'galeria' as const, icone: '🖼️', rotulo: 'Galeria' },
  { chave: 'documento' as const, icone: '📄', rotulo: 'Documento' },
]

/** Botão 📎 do chat -- abre um menu com as fontes de anexo (foto/
 *  documento), estilo WhatsApp. Mesmo padrão de Modal de MenuAnexo.tsx
 *  (que é o "+" de nova solicitação, coisa diferente -- ver BarraEntrada). */
export function MenuAnexoArquivo({
  onEscolher,
  desabilitado = false,
}: {
  onEscolher: (fonte: 'camera' | 'galeria' | 'documento') => void
  desabilitado?: boolean
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        disabled={desabilitado}
        style={({ pressed }) => [
          styles.botao,
          desabilitado && styles.botaoDesabilitado,
          pressed && !desabilitado && styles.botaoPressionado,
        ]}
        accessibilityLabel="Anexar arquivo"
      >
        <Text style={styles.botaoTexto}>📎</Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <View style={styles.folha}>
            {OPCOES.map((opcao) => (
              <Pressable
                key={opcao.chave}
                onPress={() => {
                  setAberto(false)
                  onEscolher(opcao.chave)
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPressionado: { opacity: 0.6 },
  botaoDesabilitado: { opacity: 0.4 },
  botaoTexto: { fontSize: 22 },
  fundo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  folha: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
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
