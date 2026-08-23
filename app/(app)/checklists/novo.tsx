import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useItensChecklist } from '../../../src/features/checklists/useItensChecklist'
import { useVeiculos } from '../../../src/features/veiculos/useVeiculos'
import type { Veiculo } from '../../../src/lib/tipos'
import { TIPO_CHECKLIST, type ChecklistPayload, type RespostaPayload } from '../../../src/outbox/handlers/checklist'
import { enfileirar } from '../../../src/outbox/outbox'
import { runSync } from '../../../src/outbox/syncEngine'

type Valor = 'sim' | 'nao' | 'na' | null

export default function TelaNovoChecklist() {
  const router = useRouter()
  const { veiculos } = useVeiculos()
  const { itens, carregando: carregandoItens } = useItensChecklist()

  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [odometro, setOdometro] = useState('')
  const [respostas, setRespostas] = useState<Record<number, { valor: Valor; observacao: string }>>({})
  const [enviando, setEnviando] = useState(false)

  const respondidos = useMemo(
    () => itens.filter((i) => respostas[i.id]?.valor).length,
    [itens, respostas],
  )
  const todosRespondidos = itens.length > 0 && respondidos === itens.length
  const podeEnviar = veiculo && odometro.trim() && todosRespondidos && !enviando

  function definirValor(itemId: number, valor: Valor) {
    setRespostas((atual) => ({
      ...atual,
      [itemId]: { valor, observacao: valor === 'nao' ? (atual[itemId]?.observacao ?? '') : '' },
    }))
  }

  function definirObservacao(itemId: number, observacao: string) {
    setRespostas((atual) => ({ ...atual, [itemId]: { ...atual[itemId], observacao } }))
  }

  async function enviar() {
    if (!veiculo) return
    setEnviando(true)

    const listaRespostas: RespostaPayload[] = itens.map((item) => {
      const r = respostas[item.id]
      return {
        itemId: item.id,
        conforme: r.valor === 'sim' ? true : r.valor === 'nao' ? false : null,
        observacao: r.observacao || undefined,
      }
    })

    const payload: ChecklistPayload = {
      veiculoId: veiculo.id,
      odometro: Number(odometro.replace(',', '.')) || undefined,
      respostas: listaRespostas,
      fotos: [],
    }

    await enfileirar(TIPO_CHECKLIST, payload)
    runSync()
    setEnviando(false)
    router.back()
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      {/* Cabeçalho próprio, não o nativo do Stack -- o nativo não respeita
          a área segura no Android em modo edge-to-edge, deixando o botão
          de voltar sobreposto pela barra de status (achado em teste real
          na tela de detalhe da solicitação, mesmo padrão aqui). */}
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Text style={styles.iconeVoltar}>←</Text>
        </Pressable>
        <Text style={styles.tituloCabecalho}>Novo checklist</Text>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.rotulo}>Veículo</Text>
        <View style={styles.listaVeiculos}>
          {veiculos.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => setVeiculo(v)}
              style={[styles.chip, veiculo?.id === v.id && styles.chipSelecionado]}
            >
              <Text style={[styles.chipTexto, veiculo?.id === v.id && styles.chipTextoSelecionado]}>
                {v.placa}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.rotulo}>KM do odômetro</Text>
        <TextInput
          style={styles.input}
          value={odometro}
          onChangeText={setOdometro}
          keyboardType="decimal-pad"
          placeholder="Ex.: 128500"
        />

        <View style={styles.separador} />
        <Text style={styles.contador}>
          {respondidos}/{itens.length} itens avaliados
        </Text>

        {carregandoItens ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : (
          itens.map((item, indice) => {
            const r = respostas[item.id]
            return (
              <View key={item.id} style={styles.itemCartao}>
                <Text style={styles.itemDescricao}>
                  {indice + 1}. {item.descricao}
                </Text>
                <View style={styles.opcoes}>
                  <OpcaoValor rotulo="OK" ativo={r?.valor === 'sim'} onPress={() => definirValor(item.id, 'sim')} cor="#0f766e" />
                  <OpcaoValor rotulo="Não" ativo={r?.valor === 'nao'} onPress={() => definirValor(item.id, 'nao')} cor="#be123c" />
                  <OpcaoValor rotulo="N/A" ativo={r?.valor === 'na'} onPress={() => definirValor(item.id, 'na')} cor="#64748b" />
                </View>
                {r?.valor === 'nao' && (
                  <TextInput
                    style={styles.inputObs}
                    value={r.observacao}
                    onChangeText={(t) => definirObservacao(item.id, t)}
                    placeholder="O que está errado?"
                  />
                )}
              </View>
            )
          })
        )}
      </ScrollView>

      <View style={styles.rodape}>
        <Pressable
          onPress={enviar}
          disabled={!podeEnviar}
          style={[styles.botaoEnviar, !podeEnviar && styles.botaoDesabilitado]}
        >
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoEnviarTexto}>Enviar checklist</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function OpcaoValor({
  rotulo,
  ativo,
  onPress,
  cor,
}: {
  rotulo: string
  ativo: boolean
  onPress: () => void
  cor: string
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.opcaoValor, ativo && { backgroundColor: cor, borderColor: cor }]}
    >
      <Text style={[styles.opcaoValorTexto, ativo && { color: '#fff' }]}>{rotulo}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  botaoVoltar: { padding: 6 },
  iconeVoltar: { fontSize: 22, color: '#0f172a', fontWeight: '600' },
  tituloCabecalho: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  conteudo: { padding: 16, paddingBottom: 24 },
  rotulo: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 6 },
  listaVeiculos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipSelecionado: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextoSelecionado: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 16, backgroundColor: '#fff' },
  separador: { height: 1, backgroundColor: '#e2e8f0', marginTop: 18 },
  contador: { fontSize: 13, color: '#64748b', marginTop: 12, marginBottom: 6, fontWeight: '600' },
  itemCartao: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  itemDescricao: { fontSize: 14, color: '#1e293b', marginBottom: 10, fontWeight: '500' },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcaoValor: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  opcaoValorTexto: { fontSize: 13, fontWeight: '700', color: '#475569' },
  inputObs: { marginTop: 8, borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 14, backgroundColor: '#fff' },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  botaoEnviar: { backgroundColor: '#0d9488', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoDesabilitado: { opacity: 0.4 },
  botaoEnviarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
