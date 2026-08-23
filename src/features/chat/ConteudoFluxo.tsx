import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useVeiculos } from '../veiculos/useVeiculos'
import type { FluxoSolicitacao } from './useFluxoSolicitacao'

/**
 * Área de conteúdo do roteiro guiado -- só os passos "de toque" (veículo,
 * foto, resumo/confirmar). Os passos "de texto" (descrição, valor) são
 * respondidos pela barra de entrada no rodapé do chat, não aqui.
 */
export function ConteudoFluxo({ fluxo }: { fluxo: FluxoSolicitacao }) {
  const { veiculos } = useVeiculos()
  const { passo } = fluxo
  const [buscaVeiculo, setBuscaVeiculo] = useState('')

  if (passo.tipo === 'veiculo') {
    const filtro = buscaVeiculo.trim().toLowerCase()
    const veiculosFiltrados = filtro
      ? veiculos.filter(
          (v) => v.placa.toLowerCase().includes(filtro) || v.modelo.toLowerCase().includes(filtro),
        )
      : veiculos

    return (
      <View style={styles.bloco}>
        <Bolha texto={passo.pergunta} />
        {veiculos.length > 0 && (
          <TextInput
            style={styles.buscaVeiculo}
            value={buscaVeiculo}
            onChangeText={setBuscaVeiculo}
            placeholder="Buscar por placa ou modelo…"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <View style={styles.listaVeiculos}>
          {veiculos.length === 0 && <Text style={styles.vazio}>Nenhum veículo disponível.</Text>}
          {veiculos.length > 0 && veiculosFiltrados.length === 0 && (
            <Text style={styles.vazio}>Nenhum veículo encontrado.</Text>
          )}
          {veiculosFiltrados.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => fluxo.escolherVeiculo(v)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressionado]}
            >
              <Text style={styles.chipTexto}>
                {v.placa} — {v.modelo}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    )
  }

  if (passo.tipo === 'foto_unica') {
    const jaTem = fluxo.fotos.some((f) => f.tipoFoto === passo.tipoFoto)
    return (
      <View style={styles.bloco}>
        <Bolha texto={passo.pergunta} />
        {jaTem ? (
          fluxo.avancandoAuto ? (
            // Acabou de tirar esta foto -- só o check, avança sozinho
            // em seguida (ver tirarFotoUnica em useFluxoSolicitacao.ts).
            <Text style={styles.fotoOk}>✓ Foto registrada</Text>
          ) : (
            // Voltou pra um passo cuja foto já tinha sido tirada -- sem
            // avanço automático em andamento, precisa de uma ação
            // explícita pra seguir (ou trocar a foto).
            <View style={styles.fotoRegistradaLinha}>
              <Text style={styles.fotoOk}>✓ Foto registrada</Text>
              <View style={styles.fotoRegistradaAcoes}>
                <Pressable onPress={fluxo.tirarFotoUnica} hitSlop={8}>
                  <Text style={styles.linkTirarNovo}>🔄 Tirar de novo</Text>
                </Pressable>
                <Pressable onPress={fluxo.avancar} hitSlop={8}>
                  <Text style={styles.linkContinuar}>Continuar →</Text>
                </Pressable>
              </View>
            </View>
          )
        ) : (
          <BotaoFoto onPress={fluxo.tirarFotoUnica} carregando={fluxo.capturando} texto={passo.textoBotao} />
        )}
      </View>
    )
  }

  if (passo.tipo === 'foto_multipla') {
    return (
      <View style={styles.bloco}>
        <Bolha texto={passo.pergunta} />
        <Text style={styles.contador}>{fluxo.fotos.length} foto(s) adicionada(s)</Text>
        <BotaoFoto onPress={fluxo.tirarFotoMultipla} carregando={fluxo.capturando} texto="Tirar foto" />
        {fluxo.fotos.length > 0 && (
          <Text style={styles.dica}>Toque no ➤ quando terminar de anexar fotos.</Text>
        )}
      </View>
    )
  }

  if (passo.tipo === 'confirmar') {
    return (
      <View style={styles.bloco}>
        <Bolha texto="Revise e toque no ➤ para enviar" />
        <View style={styles.resumo}>
          <LinhaResumo rotulo="Veículo" valor={fluxo.veiculo ? `${fluxo.veiculo.placa} — ${fluxo.veiculo.modelo}` : '—'} />
          {fluxo.odometro ? <LinhaResumo rotulo="KM" valor={fluxo.odometro} /> : null}
          {fluxo.descricao ? <LinhaResumo rotulo="Descrição" valor={fluxo.descricao} /> : null}
          {fluxo.fotos.length > 0 && <LinhaResumo rotulo="Fotos" valor={`${fluxo.fotos.length} anexada(s)`} />}
        </View>
        {!fluxo.podeConfirmar && (
          <Text style={styles.aviso}>Falta completar os passos anteriores.</Text>
        )}
      </View>
    )
  }

  return null
}

function Bolha({ texto }: { texto: string }) {
  return (
    <View style={styles.bolhaPergunta}>
      <Text style={styles.bolhaPerguntaTexto}>{texto}</Text>
    </View>
  )
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.linhaResumo}>
      <Text style={styles.linhaResumoRotulo}>{rotulo}</Text>
      <Text style={styles.linhaResumoValor}>{valor}</Text>
    </View>
  )
}

function BotaoFoto({
  onPress,
  carregando,
  texto = 'Tirar foto',
}: {
  onPress: () => void
  carregando: boolean
  texto?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={carregando}
      style={({ pressed }) => [styles.botaoFoto, (pressed || carregando) && styles.desabilitado]}
    >
      {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoFotoTexto}>📷 {texto}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bloco: { paddingHorizontal: 12, paddingVertical: 8 },
  bolhaPergunta: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '85%',
    marginBottom: 10,
  },
  bolhaPerguntaTexto: { fontSize: 15, color: '#1e293b', fontWeight: '600' },
  buscaVeiculo: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
    marginBottom: 8,
  },
  listaVeiculos: { gap: 6 },
  vazio: { color: '#94a3b8', fontStyle: 'italic' },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  chipPressionado: { backgroundColor: '#f1f5f9' },
  chipTexto: { fontSize: 15, color: '#0f172a' },
  fotoOk: { color: '#0f766e', fontWeight: '700', fontSize: 15 },
  fotoRegistradaLinha: { gap: 10 },
  fotoRegistradaAcoes: { flexDirection: 'row', gap: 20 },
  linkTirarNovo: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  linkContinuar: { color: '#0d9488', fontWeight: '700', fontSize: 14 },
  contador: { color: '#475569', fontSize: 13, marginBottom: 8 },
  dica: { color: '#94a3b8', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  botaoFoto: { alignSelf: 'flex-start', backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoFotoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desabilitado: { opacity: 0.6 },
  resumo: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 6 },
  linhaResumo: { flexDirection: 'row', justifyContent: 'space-between' },
  linhaResumoRotulo: { fontSize: 13, color: '#64748b' },
  linhaResumoValor: { fontSize: 13, color: '#1e293b', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  aviso: { color: '#be123c', fontSize: 12, marginTop: 8 },
})
