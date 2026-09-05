import { StyleSheet, Text, View } from 'react-native'

/**
 * Etiqueta arredondada do card de solicitação -- fundo suave, texto forte
 * e o ícone SEMPRE antes do texto.
 *
 * Mora num arquivo só, usada pelo status e pelo aviso de comprovante,
 * porque as duas nasceram com formatos diferentes (uma com fundo e o
 * ícone depois do texto, outra sem fundo e o ícone antes) e a diferença
 * saltava aos olhos no mesmo card. Estilo compartilhado é o que impede
 * isso de acontecer de novo na próxima etiqueta que aparecer.
 */

export interface CorEtiqueta {
  fundo: string
  texto: string
}

export const CORES_ETIQUETA = {
  PENDENTE: { fundo: '#fef3c7', texto: '#92400e' },
  APROVADO: { fundo: '#d1fae5', texto: '#065f46' },
  REPROVADO: { fundo: '#fee2e2', texto: '#991b1b' },
  local: { fundo: '#e2e8f0', texto: '#475569' },
  erro: { fundo: '#fee2e2', texto: '#991b1b' },
} satisfies Record<string, CorEtiqueta>

export function Etiqueta({
  icone,
  texto,
  cor,
  style,
}: {
  /** Opcional: estados em andamento ("Enviando…") não têm ícone. */
  icone?: string
  texto: string
  cor: CorEtiqueta
  /** Só pra quem precisa de espaçamento próprio no card. */
  style?: object
}) {
  return (
    <View style={[estilos.etiqueta, { backgroundColor: cor.fundo }, style]}>
      <Text style={[estilos.texto, { color: cor.texto }]}>
        {icone ? `${icone} ` : ''}
        {texto}
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  etiqueta: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  texto: { fontSize: 12, fontWeight: '700' },
})
