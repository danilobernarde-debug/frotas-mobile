import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { obterLocalizacaoAtual } from '../../lib/localizacao'
import { cidadeMaisProxima, type Municipio } from '../../lib/municipios'
import { BuscaCidade } from './BuscaCidade'

/**
 * Trajeto no formato de aplicativo de mapa: uma trilha vertical à
 * esquerda ligando origem (círculo) a destino (alfinete), com as paradas
 * enfileiradas no meio.
 *
 * A trilha não é enfeite -- é o que comunica que os campos são um
 * caminho, e não uma lista de cidades soltas. Antes eram campos rotulados
 * "Origem"/"Destino"/"Parada 1", que dizem a mesma coisa mas obrigam a
 * ler para entender a ordem.
 */
export function ListaTrajeto({
  paradas,
  aoDefinir,
  aoAdicionar,
  aoRemover,
}: {
  paradas: (Municipio | null)[]
  aoDefinir: (indice: number, m: Municipio) => void
  aoAdicionar: () => void
  aoRemover: (indice: number) => void
}) {
  const [buscando, setBuscando] = useState<number | null>(null)
  const [localizando, setLocalizando] = useState(false)

  /**
   * Preenche a origem com o município mais próximo do GPS.
   *
   * A conta é local (cidadeMaisProxima) em vez de geocodificação reversa,
   * que precisa de internet -- e a origem é justamente o campo que o
   * motorista preenche onde ele está, que costuma ser onde não tem sinal.
   */
  async function usarLocalizacaoAtual() {
    setLocalizando(true)
    const local = await obterLocalizacaoAtual()
    setLocalizando(false)
    if (!local) {
      Alert.alert('Sem localização', 'Não consegui pegar sua posição. Confira a permissão de localização.')
      return
    }
    const cidade = cidadeMaisProxima(local.latitude, local.longitude)
    if (cidade) aoDefinir(0, cidade)
  }

  return (
    <View>
      {paradas.map((parada, i) => {
        const ehPrimeira = i === 0
        const ehUltima = i === paradas.length - 1
        return (
          <View key={i} style={estilos.linha}>
            <View style={estilos.trilha}>
              {ehPrimeira ? (
                <Ionicons name="ellipse-outline" size={18} color="#0f172a" />
              ) : ehUltima ? (
                <Ionicons name="location" size={22} color="#dc2626" />
              ) : (
                <Ionicons name="ellipse" size={10} color="#64748b" />
              )}
              {!ehUltima && <View style={estilos.tracejado} />}
            </View>

            <View style={estilos.campoArea}>
              <Pressable
                onPress={() => setBuscando(i)}
                style={[estilos.campo, parada && estilos.campoPreenchido]}
              >
                <Text style={parada ? estilos.valor : estilos.vazio} numberOfLines={1}>
                  {parada
                    ? `${parada[0]} — ${parada[1]}`
                    : ehPrimeira
                      ? 'Escolher ponto de partida'
                      : ehUltima
                        ? 'Informe o destino…'
                        : 'Escolher parada'}
                </Text>

                {/* Alfinete só na origem: é o único campo que o motorista
                    preenche estando no lugar. */}
                {ehPrimeira && (
                  <Pressable
                    onPress={usarLocalizacaoAtual}
                    disabled={localizando}
                    hitSlop={10}
                    style={estilos.botaoLocal}
                  >
                    {localizando ? (
                      <ActivityIndicator size="small" color="#0d9488" />
                    ) : (
                      <Ionicons name="locate" size={20} color="#0d9488" />
                    )}
                  </Pressable>
                )}
              </Pressable>

              {/* Origem e destino não somem -- trajeto com uma parada só
                  não é trajeto. Da terceira em diante, dá pra tirar. */}
              {paradas.length > 2 && (
                <Pressable onPress={() => aoRemover(i)} hitSlop={10} style={estilos.botaoRemover}>
                  <Ionicons name="close" size={18} color="#94a3b8" />
                </Pressable>
              )}
            </View>
          </View>
        )
      })}

      <Pressable onPress={aoAdicionar} hitSlop={8} style={estilos.adicionar}>
        <Ionicons name="add" size={18} color="#0d9488" />
        <Text style={estilos.adicionarTexto}>Adicionar parada</Text>
      </Pressable>

      {/* Montado só quando aberto: dois <Modal> do RN visíveis juntos
          travam o iOS neste projeto. */}
      {buscando !== null && (
        <BuscaCidade
          titulo={buscando === 0 ? 'Ponto de partida' : buscando === paradas.length - 1 ? 'Destino' : 'Parada'}
          aoFechar={() => setBuscando(null)}
          aoEscolher={(m) => {
            aoDefinir(buscando, m)
            setBuscando(null)
          }}
        />
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start' },
  // Largura fixa e altura do campo: é o que mantém os marcadores
  // alinhados entre si, formando a trilha contínua.
  trilha: { width: 28, alignItems: 'center', paddingTop: 16 },
  tracejado: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderLeftColor: '#cbd5e1',
    borderStyle: 'dashed',
    marginVertical: 4,
    minHeight: 18,
  },
  campoArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  campo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  campoPreenchido: { backgroundColor: '#f0fdfa', borderColor: '#99f6e4' },
  valor: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0f766e' },
  vazio: { flex: 1, fontSize: 16, color: '#94a3b8' },
  botaoLocal: { paddingLeft: 10 },
  botaoRemover: { padding: 4 },
  adicionar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 28, marginTop: 4 },
  adicionarTexto: { fontSize: 14, fontWeight: '700', color: '#0d9488' },
})
