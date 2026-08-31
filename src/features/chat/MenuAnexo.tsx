import { useRef, useState } from 'react'
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
  mostrarSolicitacao = true,
}: {
  onEscolher?: (categoria: CategoriaSolicitacao) => void
  onEscolherAnexo: (fonte: 'camera' | 'galeria' | 'documento') => Promise<void>
  onEscolherLocalizacao: () => void
  /** true enquanto uma solicitação já está em andamento -- evita iniciar
   *  uma segunda por cima da primeira. Não desabilita os anexos: nada
   *  impede anexar um arquivo enquanto uma solicitação está em curso. */
  desabilitado?: boolean
  /** false quando quem está no chat é GESTOR/ADMIN vendo a conversa de
   *  OUTRA pessoa (ver conversas/[id].tsx) -- "solicitar abastecimento/
   *  manutenção" só faz sentido do lado do próprio encarregado. */
  mostrarSolicitacao?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const acaoPendente = useRef<(() => void) | null>(null)

  function dispararPendente() {
    const acao = acaoPendente.current
    acaoPendente.current = null
    acao?.()
  }

  /** Fecha o modal e só chama a ação DEPOIS que ele terminar de fechar de
   *  verdade -- abrir outra UI nativa (câmera, seletor de foto/vídeo,
   *  seletor de documento) enquanto ESTE modal ainda está no meio da
   *  animação de fechar pode falhar em silêncio no iOS (a nova
   *  apresentação se perde, ou pior: o seletor nativo fica "preso"
   *  esperando, e a PRÓXIMA tentativa esbarra nele -- expo-document-picker
   *  chega a lançar "Different document picking in progress"). Duas
   *  tentativas antes desta não foram confiáveis sozinhas: setTimeout(300ms)
   *  fixo, depois só onDismiss (iOS) -- Modal transparent nem sempre
   *  dispara onDismiss de forma consistente. Agora os dois juntos, com
   *  disparo único (dispararPendente zera acaoPendente no 1º disparo,
   *  então não importa qual dos dois chega primeiro -- o outro vira no-op). */
  function fecharEDepois(acao: () => void) {
    acaoPendente.current = acao
    setAberto(false)
    setTimeout(dispararPendente, 400)
  }

  /** Galeria/documento abrem um seletor NATIVO do sistema (UIImagePickerController/
   *  UIDocumentPickerViewController no iOS, não um <Modal> do React Native)
   *  -- fechar ESTE modal antes de abrir o seletor é a race condition do
   *  comentário acima (mesmo com fecharEDepois, ainda falhava de vez em
   *  quando no iOS: o seletor abria e fechava sozinho na hora, sem erro
   *  nenhum -- achado real, reportado como "não abre nada"). Em vez de
   *  fechar e esperar, mantém ESTE modal aberto (visualmente coberto pelo
   *  seletor, que fica por cima) e só fecha depois que o seletor já
   *  resolveu -- apresentação aninhada é o caso comum e bem suportado no
   *  iOS quando é um seletor NATIVO por cima. */
  async function aoEscolherEEsperar(fonte: 'galeria' | 'documento') {
    await onEscolherAnexo(fonte)
    setAberto(false)
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

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(false)}
        onDismiss={dispararPendente}
      >
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <View style={styles.folha}>
            {mostrarSolicitacao && onEscolher && (
              <>
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
              </>
            )}

            {OPCOES_ANEXO.map((opcao) => (
              <Pressable
                key={opcao.fonte}
                onPress={() =>
                  // Câmera abre OUTRO <Modal> do RN (CameraCustomizada) --
                  // dois <Modal> nativos abertos ao mesmo tempo no iOS é o
                  // caso que trava o app (mesma causa raiz já vista antes
                  // com a câmera do abastecimento, ver presentation:'card'
                  // em nova-solicitacao). Precisa fechar ESTE primeiro,
                  // diferente de galeria/documento (seletor nativo, não
                  // <Modal>, pode abrir por cima sem travar).
                  opcao.fonte === 'camera'
                    ? fecharEDepois(() => onEscolherAnexo('camera'))
                    : aoEscolherEEsperar(opcao.fonte)
                }
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
