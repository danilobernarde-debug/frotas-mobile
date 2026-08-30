import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../../src/auth/useAuth'
import { useCapturaComLocal, type FotoComLocal } from '../../../src/camera/useCapturaComLocal'
import { PreviaMarcaDagua } from '../../../src/camera/PreviaMarcaDagua'
import { useItensChecklist } from '../../../src/features/checklists/useItensChecklist'
import { useVeiculos } from '../../../src/features/veiculos/useVeiculos'
import type { Veiculo } from '../../../src/lib/tipos'
import { TIPO_CHECKLIST, type ChecklistPayload, type RespostaPayload } from '../../../src/outbox/handlers/checklist'
import type { FotoPayload } from '../../../src/outbox/handlers/novaSolicitacao'
import { enfileirar } from '../../../src/outbox/outbox'
import { runSync } from '../../../src/outbox/syncEngine'

type Valor = 'sim' | 'nao' | 'na' | null

export default function TelaNovoChecklist() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { veiculos } = useVeiculos()
  const { itens, carregando: carregandoItens } = useItensChecklist()
  const { capturar } = useCapturaComLocal()

  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [buscaVeiculo, setBuscaVeiculo] = useState('')
  // A frota real tem mais de 100 veículos -- lista sempre aberta faria
  // rolar tudo isso só pra chegar nos itens do checklist. Colapsa pra uma
  // linha assim que escolhe; "Trocar" reabre a busca (mesmo padrão de
  // app/(app)/nova-solicitacao.tsx).
  const [trocandoVeiculo, setTrocandoVeiculo] = useState(false)
  const [odometro, setOdometro] = useState('')
  const [respostas, setRespostas] = useState<Record<number, { valor: Valor; observacao: string }>>({})
  const [enviando, setEnviando] = useState(false)

  // Foto opcional por item -- uma por item, disponível em qualquer um dos
  // 20 (não só nos marcados "Não"). Ainda não enviada.
  const [fotosPorItem, setFotosPorItem] = useState<Record<number, FotoComLocal>>({})
  const [capturandoItemId, setCapturandoItemId] = useState<number | null>(null)
  // uri local da foto aberta em tela cheia, ou null se o modal tá fechado.
  const [fotoAberta, setFotoAberta] = useState<string | null>(null)

  // Alimenta a marca d'água ao vivo no visor da câmera (mesmos dados que
  // a prévia pós-captura já mostrava, ver PreviaMarcaDagua abaixo).
  const marcaDagua = { nomeMotorista: perfil?.motoristaNome, placa: veiculo?.placa }

  async function tirarFotoItem(itemId: number) {
    setCapturandoItemId(itemId)
    const foto = await capturar((uri, local) => {
      // Localização pode terminar depois da foto já estar na tela (ver
      // capturar() em useCapturaComLocal) -- casa por uri, não por
      // itemId: outra foto de outro item pode ter sido tirada nesse meio
      // tempo, itemId sozinho arriscaria completar a errada.
      if (!local) return
      setFotosPorItem((atual) => {
        const atualDoItem = atual[itemId]
        if (!atualDoItem || atualDoItem.uriLocal !== uri) return atual
        return {
          ...atual,
          [itemId]: {
            ...atualDoItem,
            latitude: local.latitude,
            longitude: local.longitude,
            localizacaoRotulo: local.rotulo ?? undefined,
          },
        }
      })
    }, marcaDagua)
    setCapturandoItemId(null)
    if (!foto) return
    setFotosPorItem((atual) => ({ ...atual, [itemId]: foto }))
  }

  function removerFotoItem(itemId: number) {
    setFotosPorItem((atual) => {
      const { [itemId]: _removida, ...resto } = atual
      return resto
    })
  }

  const mostrarListaVeiculos = !veiculo || trocandoVeiculo
  const filtro = buscaVeiculo.trim().toLowerCase()
  const veiculosFiltrados = filtro
    ? veiculos.filter((v) => v.placa.toLowerCase().includes(filtro) || v.modelo.toLowerCase().includes(filtro))
    : veiculos

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

    const fotos: FotoPayload[] = Object.entries(fotosPorItem).map(([itemId, foto]) => ({
      uriLocal: foto.uriLocal,
      itemId: Number(itemId),
      status: 'pendente',
      capturadaEm: foto.capturadaEm,
      latitude: foto.latitude,
      longitude: foto.longitude,
      localizacaoRotulo: foto.localizacaoRotulo,
    }))

    const payload: ChecklistPayload = {
      veiculoId: veiculo.id,
      motoristaId: perfil?.motorista_id ?? undefined,
      odometro: Number(odometro.replace(',', '.')) || undefined,
      respostas: listaRespostas,
      fotos,
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
        {perfil?.motoristaNome && (
          <Text style={styles.motoristaVinculado}>🚗 Motorista: {perfil.motoristaNome}</Text>
        )}

        <Text style={styles.rotulo}>Veículo</Text>
        {mostrarListaVeiculos ? (
          <>
            {veiculos.length > 0 && (
              <TextInput
                style={styles.input}
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
                  onPress={() => {
                    setVeiculo(v)
                    setTrocandoVeiculo(false)
                  }}
                  style={[styles.chip, veiculo?.id === v.id && styles.chipSelecionado]}
                >
                  <Text style={[styles.chipTexto, veiculo?.id === v.id && styles.chipTextoSelecionado]}>
                    {v.placa} — {v.modelo}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.veiculoEscolhido}>
            <Text style={styles.veiculoEscolhidoTexto}>
              {veiculo!.placa} — {veiculo!.modelo}
            </Text>
            <Pressable onPress={() => setTrocandoVeiculo(true)} hitSlop={8}>
              <Text style={styles.linkTrocar}>Trocar</Text>
            </Pressable>
          </View>
        )}

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
            const foto = fotosPorItem[item.id]
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
                <View style={styles.linhaFoto}>
                  {foto ? (
                    <View style={styles.fotoItemPronta}>
                      <Pressable onPress={() => setFotoAberta(foto.uriLocal)}>
                        <Image source={{ uri: foto.uriLocal }} style={styles.miniaturaItem} resizeMode="cover" />
                      </Pressable>
                      <Pressable
                        onPress={() => removerFotoItem(item.id)}
                        hitSlop={8}
                        style={styles.removerFotoItem}
                      >
                        <Text style={styles.removerFotoItemTexto}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => tirarFotoItem(item.id)}
                      disabled={capturandoItemId === item.id}
                      style={[styles.botaoFotoItem, capturandoItemId === item.id && styles.desabilitado]}
                    >
                      {capturandoItemId === item.id ? (
                        <ActivityIndicator size="small" color="#0d9488" />
                      ) : (
                        <Text style={styles.botaoFotoItemTexto}>📷 Foto</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      <Modal visible={fotoAberta !== null} transparent animationType="fade" onRequestClose={() => setFotoAberta(null)}>
        <Pressable style={styles.fundoModalFoto} onPress={() => setFotoAberta(null)}>
          {fotoAberta && (
            <View style={styles.fotoAmpliadaContainer}>
              <Image source={{ uri: fotoAberta }} style={styles.fotoAmpliadaModal} resizeMode="contain" />
              {(() => {
                const foto = Object.values(fotosPorItem).find((f) => f.uriLocal === fotoAberta)
                if (!foto) return null
                return (
                  <PreviaMarcaDagua
                    capturadaEm={foto.capturadaEm}
                    nomeMotorista={perfil?.motoristaNome}
                    placa={veiculo?.placa}
                    latitude={foto.latitude}
                    longitude={foto.longitude}
                    localizacaoRotulo={foto.localizacaoRotulo}
                  />
                )
              })()}
            </View>
          )}
        </Pressable>
      </Modal>

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
  motoristaVinculado: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f766e',
    backgroundColor: '#f0fdfa',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  rotulo: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 14, marginBottom: 6 },
  listaVeiculos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  vazio: { color: '#94a3b8', fontStyle: 'italic' },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipSelecionado: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextoSelecionado: { color: '#fff' },
  veiculoEscolhido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  veiculoEscolhidoTexto: { fontSize: 15, fontWeight: '600', color: '#0f172a', flexShrink: 1 },
  linkTrocar: { color: '#0d9488', fontWeight: '700', fontSize: 14, marginLeft: 10 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 16, backgroundColor: '#fff' },
  separador: { height: 1, backgroundColor: '#e2e8f0', marginTop: 18 },
  contador: { fontSize: 13, color: '#64748b', marginTop: 12, marginBottom: 6, fontWeight: '600' },
  itemCartao: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  itemDescricao: { fontSize: 14, color: '#1e293b', marginBottom: 10, fontWeight: '500' },
  opcoes: { flexDirection: 'row', gap: 8 },
  opcaoValor: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  opcaoValorTexto: { fontSize: 13, fontWeight: '700', color: '#475569' },
  inputObs: { marginTop: 8, borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 14, backgroundColor: '#fff' },
  linhaFoto: { marginTop: 8 },
  botaoFotoItem: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0d9488',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 44,
  },
  botaoFotoItemTexto: { color: '#0d9488', fontSize: 13, fontWeight: '700' },
  desabilitado: { opacity: 0.6 },
  fotoItemPronta: { flexDirection: 'row', alignItems: 'flex-start' },
  miniaturaItem: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e2e8f0' },
  removerFotoItem: {
    marginLeft: -10,
    marginTop: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removerFotoItemTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fundoModalFoto: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fotoAmpliadaContainer: { width: '100%', height: '85%' },
  fotoAmpliadaModal: { width: '100%', height: '100%' },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  botaoEnviar: { backgroundColor: '#0d9488', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoDesabilitado: { opacity: 0.4 },
  botaoEnviarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
