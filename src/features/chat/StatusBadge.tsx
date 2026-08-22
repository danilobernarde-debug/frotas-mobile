import { StyleSheet, Text, View } from 'react-native'
import type { EntradaChat } from './types'

const CORES: Record<string, { bg: string; texto: string }> = {
  PENDENTE: { bg: '#fef3c7', texto: '#92400e' },
  APROVADO: { bg: '#d1fae5', texto: '#065f46' },
  REPROVADO: { bg: '#fee2e2', texto: '#991b1b' },
  local: { bg: '#e2e8f0', texto: '#475569' },
  erro: { bg: '#fee2e2', texto: '#991b1b' },
}

export function StatusBadge({ entrada }: { entrada: EntradaChat & { tipo: 'solicitacao' } }) {
  let rotulo: string
  let estilo = CORES.local

  if (entrada.fonte === 'servidor') {
    const status = entrada.aprovacao.status
    rotulo = status === 'APROVADO' ? 'Aprovado ✅' : status === 'REPROVADO' ? 'Reprovado ❌' : 'Pendente'
    estilo = CORES[status] ?? CORES.local
  } else if (entrada.item.permanente) {
    rotulo = 'Não foi possível enviar'
    estilo = CORES.erro
  } else if (entrada.item.status === 'enviando') {
    rotulo = 'Enviando…'
  } else {
    rotulo = 'Aguardando envio'
  }

  return (
    <View style={[styles.badge, { backgroundColor: estilo.bg }]}>
      <Text style={[styles.texto, { color: estilo.texto }]}>{rotulo}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  texto: { fontSize: 12, fontWeight: '700' },
})
