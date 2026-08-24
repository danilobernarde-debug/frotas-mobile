import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

export interface ItemMenuAcao {
  rotulo: string
  aoTocar: () => void
}

const LARGURA_MENU = 200
const ALTURA_ITEM = 46
const MARGEM_TELA = 10

/**
 * Menu suspenso estilo WhatsApp: aparece perto do ponto tocado (toque
 * longo numa bolha), não centralizado como os outros modais do app
 * (CabecalhoApp, foto ampliada em nova-solicitacao.tsx) -- por isso
 * calcula a própria posição em vez de reaproveitar aqueles.
 */
export function MenuAcoesMensagem({
  visivel,
  ponto,
  itens,
  onFechar,
}: {
  visivel: boolean
  ponto: { x: number; y: number } | null
  itens: ItemMenuAcao[]
  onFechar: () => void
}) {
  if (!ponto) return null

  const { width: larguraTela, height: alturaTela } = Dimensions.get('window')
  const alturaMenu = itens.length * ALTURA_ITEM + 8

  let x = ponto.x - LARGURA_MENU / 2
  x = Math.max(MARGEM_TELA, Math.min(x, larguraTela - LARGURA_MENU - MARGEM_TELA))

  // Prioriza abrir acima do dedo (igual WhatsApp) -- só cai pra abaixo
  // quando não sobra espaço em cima.
  let y = ponto.y - alturaMenu - 16
  if (y < MARGEM_TELA + 30) y = ponto.y + 24
  y = Math.max(MARGEM_TELA + 30, Math.min(y, alturaTela - alturaMenu - MARGEM_TELA))

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <Pressable style={styles.fundo} onPress={onFechar}>
        <View style={[styles.menu, { left: x, top: y, width: LARGURA_MENU }]}>
          {itens.map((item, indice) => (
            <Pressable
              key={item.rotulo}
              onPress={() => {
                onFechar()
                item.aoTocar()
              }}
              style={({ pressed }) => [
                styles.item,
                indice < itens.length - 1 && styles.itemComBorda,
                pressed && styles.itemPressionado,
              ]}
            >
              <Text style={styles.itemTexto}>{item.rotulo}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.3)' },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  item: { paddingVertical: 13, paddingHorizontal: 16 },
  itemComBorda: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemPressionado: { backgroundColor: '#f8fafc' },
  itemTexto: { fontSize: 15, color: '#0f172a', fontWeight: '600' },
})
