import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { CategoriaSolicitacao } from '../../lib/tipos'

/** Lista extensível de propósito -- uma 3ª opção no futuro é só somar um
 *  item aqui, sem mexer no resto do menu. */
const OPCOES_SOLICITACAO: { categoria: CategoriaSolicitacao; icone: string; rotulo: string }[] = [
  { categoria: 'ABASTECIMENTO', icone: '⛽', rotulo: 'Abastecimento' },
  { categoria: 'MANUTENÇÃO', icone: '🔧', rotulo: 'Manutenção' },
]

const OPCOES_ANEXO: { fonte: 'camera' | 'galeria' | 'documento'; icone: string; rotulo: string }[] = [
  { fonte: 'camera', icone: '📷', rotulo: 'Câmera' },
  { fonte: 'galeria', icone: '🖼️', rotulo: 'Foto ou vídeo' },
  { fonte: 'documento', icone: '📄', rotulo: 'Documento' },
]

/**
 * Botão "+" único, com as duas famílias de opção que ele sempre teve
 * espalhadas em dois botões separados -- solicitação (abastecimento/
 * manutenção) em cima, anexo de arquivo/localização embaixo, com uma
 * linha separando os grupos (pedido do usuário: "coloca abaixo deles,
 * separado com alguma coisa").
 */
export function MenuAnexo({
  onEscolher,
  onEscolherAnexo,
  onEscolherLocalizacao,
  desabilitado = false,
}: {
  onEscolher: (categoria: CategoriaSolicitacao) => void
  onEscolherAnexo: (fonte: 'camera' | 'galeria' | 'documento') => void
  onEscolherLocalizacao: () => void
  /** true enquanto uma solicitação já está em andamento -- evita iniciar
   *  uma segunda por cima da primeira. Não desabilita os anexos: nada
   *  impede anexar um arquivo enquanto uma solicitação está em curso. */
  desabilitado?: boolean
}) {
  const [aberto, setAberto] = useState(false)

  /** Fecha o modal e só chama a ação depois -- no iOS, abrir a câmera do
   *  sistema (ImagePicker.launchCameraAsync) enquanto ESTE modal ainda
   *  está no meio da animação de fechar pode falhar em silêncio (a nova
   *  apresentação nativa se perde) -- achado real: usuário relatou "toco
   *  em Câmera e não abre nada", sem erro nenhum no log. O atraso dá
   *  tempo da transição terminar antes de pedir a próxima UI nativa. */
  function fecharEDepois(acao: () => void) {
    setAberto(false)
    setTimeout(acao, 300)
  }

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        style={({ pressed }) => [styles.botao, pressed && styles.botaoPressionado]}
        accessibilityLabel="Anexar ou solicitar"
      >
        <Text style={styles.botaoTexto}>+</Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <View style={styles.folha}>
            <Text style={styles.titulo}>O que você quer solicitar?</Text>
            {OPCOES_SOLICITACAO.map((opcao) => (
              <Pressable
                key={opcao.categoria}
                disabled={desabilitado}
                onPress={() => fecharEDepois(() => onEscolher(opcao.categoria))}
                style={({ pressed }) => [
                  styles.opcao,
                  desabilitado && styles.opcaoDesabilitada,
                  pressed && !desabilitado && styles.opcaoPressionada,
                ]}
              >
                <Text style={styles.opcaoIcone}>{opcao.icone}</Text>
                <Text style={styles.opcaoTexto}>{opcao.rotulo}</Text>
              </Pressable>
            ))}

            <View style={styles.divisor} />

            {OPCOES_ANEXO.map((opcao) => (
              <Pressable
                key={opcao.fonte}
                onPress={() => fecharEDepois(() => onEscolherAnexo(opcao.fonte))}
                style={({ pressed }) => [styles.opcao, pressed && styles.opcaoPressionada]}
              >
                <Text style={styles.opcaoIcone}>{opcao.icone}</Text>
                <Text style={styles.opcaoTexto}>{opcao.rotulo}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => fecharEDepois(onEscolherLocalizacao)}
              style={({ pressed }) => [styles.opcao, pressed && styles.opcaoPressionada]}
            >
              <Text style={styles.opcaoIcone}>📍</Text>
              <Text style={styles.opcaoTexto}>Localização</Text>
            </Pressable>
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
  divisor: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  opcaoPressionada: { backgroundColor: '#f1f5f9' },
  opcaoDesabilitada: { opacity: 0.4 },
  opcaoIcone: { fontSize: 24 },
  opcaoTexto: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
})
