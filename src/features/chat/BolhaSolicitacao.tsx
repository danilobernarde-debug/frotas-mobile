import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBadge } from './StatusBadge'
import type { EntradaChat } from './types'

const ROTULO_CATEGORIA: Record<string, string> = {
  ABASTECIMENTO: '⛽ Abastecimento',
  'MANUTENÇÃO': '🔧 Manutenção',
  OUTRO: 'Outro',
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BolhaSolicitacao({ entrada }: { entrada: EntradaChat & { tipo: 'solicitacao' } }) {
  const router = useRouter()

  if (entrada.fonte === 'servidor') {
    const a = entrada.aprovacao
    return (
      <Pressable
        onPress={() => router.push(`/solicitacao/${a.id}`)}
        style={({ pressed }) => [styles.bolha, pressed && styles.pressionada]}
      >
        <Text style={styles.categoria}>{ROTULO_CATEGORIA[a.categoria ?? 'OUTRO']}</Text>
        <Text style={styles.veiculo}>{a.veiculo?.placa ?? '—'}</Text>
        <Text style={styles.servico} numberOfLines={2}>
          {a.servico}
        </Text>
        {a.valor > 0 && <Text style={styles.valor}>{moeda(a.valor)}</Text>}
        <View style={styles.rodape}>
          <StatusBadge entrada={entrada} />
        </View>
      </Pressable>
    )
  }

  const p = entrada.item.payload
  const fotosEnviadas = p.fotos.filter((f) => f.status === 'enviado').length
  return (
    <View style={[styles.bolha, styles.bolhaLocal]}>
      <Text style={styles.categoria}>{ROTULO_CATEGORIA[p.categoria]}</Text>
      <Text style={styles.servico} numberOfLines={2}>
        {p.servico}
      </Text>
      {p.fotos.length > 0 && (
        <Text style={styles.fotos}>
          {fotosEnviadas}/{p.fotos.length} foto(s) enviada(s)
        </Text>
      )}
      {entrada.item.permanente && entrada.item.erroMsg && (
        <Text style={styles.erroMsg}>{entrada.item.erroMsg}</Text>
      )}
      <View style={styles.rodape}>
        <StatusBadge entrada={entrada} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bolha: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 12,
    maxWidth: '86%',
    alignSelf: 'flex-end',
  },
  bolhaLocal: { backgroundColor: '#f8fafc', borderStyle: 'dashed' },
  pressionada: { opacity: 0.7 },
  categoria: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 2 },
  veiculo: { fontSize: 13, fontWeight: '600', color: '#334155' },
  servico: { fontSize: 14, color: '#1e293b', marginTop: 2 },
  valor: { fontSize: 13, color: '#475569', marginTop: 4, fontWeight: '600' },
  fotos: { fontSize: 12, color: '#64748b', marginTop: 4 },
  erroMsg: { fontSize: 12, color: '#be123c', marginTop: 4 },
  rodape: { marginTop: 8, flexDirection: 'row' },
})
