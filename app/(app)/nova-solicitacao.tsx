import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SLOTS_ABASTECIMENTO } from '../../src/features/chat/fluxo'
import { useFormularioSolicitacao } from '../../src/features/chat/useFormularioSolicitacao'
import { useVeiculos } from '../../src/features/veiculos/useVeiculos'
import type { CategoriaSolicitacao } from '../../src/lib/tipos'

const TITULOS: Partial<Record<CategoriaSolicitacao, string>> = {
  ABASTECIMENTO: 'Novo abastecimento',
  'MANUTENÇÃO': 'Nova manutenção',
}

/**
 * Tela cheia estilo "criar enquete" do WhatsApp -- abre por cima do chat
 * (Stack.Screen com presentation: 'modal' em (app)/_layout.tsx), com
 * todos os campos da solicitação visíveis de uma vez, em vez do roteiro
 * passo a passo de antes. O chat continua sendo pra onde a solicitação
 * vai (aparece lá como bolha depois de enviada) -- só a forma de
 * preencher mudou.
 */
export default function TelaNovaSolicitacao() {
  const router = useRouter()
  const { categoria: categoriaParam } = useLocalSearchParams<{ categoria: CategoriaSolicitacao }>()
  // Só alcançável pelos 2 botões do próprio MenuAnexo (ABASTECIMENTO/
  // MANUTENÇÃO) -- sem valor válido não tem como ter chegado aqui.
  const categoria: CategoriaSolicitacao = categoriaParam ?? 'MANUTENÇÃO'

  const formulario = useFormularioSolicitacao(categoria)
  const { veiculos } = useVeiculos()
  const [buscaVeiculo, setBuscaVeiculo] = useState('')
  // A frota real tem mais de 100 veículos -- lista sempre aberta faria
  // rolar tudo isso só pra chegar nos campos de baixo. Colapsa pra uma
  // linha assim que escolhe; "Trocar" reabre a busca.
  const [trocandoVeiculo, setTrocandoVeiculo] = useState(false)
  const mostrarListaVeiculos = !formulario.veiculo || trocandoVeiculo
  // uri local (a foto ainda nem foi enviada, não precisa buscar do
  // servidor) da foto aberta em tela cheia, ou null se o modal tá fechado.
  const [fotoAberta, setFotoAberta] = useState<string | null>(null)

  const filtro = buscaVeiculo.trim().toLowerCase()
  const veiculosFiltrados = filtro
    ? veiculos.filter((v) => v.placa.toLowerCase().includes(filtro) || v.modelo.toLowerCase().includes(filtro))
    : veiculos

  async function enviar() {
    await formulario.enviarSolicitacao()
    router.back()
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoFechar}>
          <Text style={styles.iconeFechar}>✕</Text>
        </Pressable>
        <Text style={styles.tituloCabecalho}>{TITULOS[categoria] ?? 'Nova solicitação'}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
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
                      formulario.setVeiculo(v)
                      setTrocandoVeiculo(false)
                    }}
                    style={[styles.chip, formulario.veiculo?.id === v.id && styles.chipSelecionado]}
                  >
                    <Text style={[styles.chipTexto, formulario.veiculo?.id === v.id && styles.chipTextoSelecionado]}>
                      {v.placa} — {v.modelo}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.veiculoEscolhido}>
              <Text style={styles.veiculoEscolhidoTexto}>
                {formulario.veiculo!.placa} — {formulario.veiculo!.modelo}
              </Text>
              <Pressable onPress={() => setTrocandoVeiculo(true)} hitSlop={8}>
                <Text style={styles.linkTrocar}>Trocar</Text>
              </Pressable>
            </View>
          )}

          {categoria === 'ABASTECIMENTO' ? (
            <>
              <Text style={styles.rotulo}>KM atual do veículo</Text>
              <TextInput
                style={styles.input}
                value={formulario.odometro}
                onChangeText={formulario.setOdometro}
                keyboardType="decimal-pad"
                placeholder="Ex.: 128500"
                placeholderTextColor="#94a3b8"
              />
            </>
          ) : (
            <>
              <Text style={styles.rotulo}>Descreva o problema</Text>
              <TextInput
                style={[styles.input, styles.inputMultilinha]}
                value={formulario.descricao}
                onChangeText={formulario.setDescricao}
                placeholder="O que está acontecendo com o veículo?"
                placeholderTextColor="#94a3b8"
                multiline
              />
            </>
          )}

          <Text style={styles.rotulo}>Valor estimado (opcional)</Text>
          <TextInput
            style={styles.input}
            value={formulario.valor}
            onChangeText={formulario.setValor}
            keyboardType="decimal-pad"
            placeholder="R$"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.rotulo}>Fotos</Text>
          <View style={styles.listaFotos}>
            {categoria === 'ABASTECIMENTO'
              ? SLOTS_ABASTECIMENTO.map((slot) => {
                  const foto = formulario.fotos.find((f) => f.tipoFoto === slot.tipoFoto)
                  return foto ? (
                    <LinhaFotoPronta
                      key={slot.tipoFoto}
                      uri={foto.uriLocal}
                      rotulo={slot.rotulo}
                      aoAbrir={() => setFotoAberta(foto.uriLocal)}
                      aoTirarNovamente={() => formulario.tirarFotoSlot(slot.tipoFoto)}
                    />
                  ) : (
                    <BotaoFoto
                      key={slot.tipoFoto}
                      onPress={() => formulario.tirarFotoSlot(slot.tipoFoto)}
                      carregando={formulario.capturando}
                      texto={slot.textoBotao}
                    />
                  )
                })
              : [
                  ...formulario.fotos.map((foto, indice) => (
                    <LinhaFotoPronta
                      key={foto.uriLocal}
                      uri={foto.uriLocal}
                      rotulo={`Foto ${indice + 1}`}
                      aoAbrir={() => setFotoAberta(foto.uriLocal)}
                      aoTirarNovamente={() => formulario.substituirFotoMultipla(foto.uriLocal)}
                    />
                  )),
                  <BotaoFoto
                    key="tirar-foto"
                    onPress={formulario.tirarFotoMultipla}
                    carregando={formulario.capturando}
                    texto={formulario.fotos.length > 0 ? 'Tirar outra foto' : 'Tirar foto'}
                  />,
                ]}
          </View>
        </ScrollView>

        <View style={styles.rodape}>
          <Pressable
            onPress={enviar}
            disabled={!formulario.podeEnviar || formulario.enviando}
            style={[styles.botaoEnviar, (!formulario.podeEnviar || formulario.enviando) && styles.botaoDesabilitado]}
          >
            {formulario.enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botaoEnviarTexto}>Enviar solicitação</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={fotoAberta !== null} transparent animationType="fade" onRequestClose={() => setFotoAberta(null)}>
        <Pressable style={styles.fundoModalFoto} onPress={() => setFotoAberta(null)}>
          {fotoAberta && <Image source={{ uri: fotoAberta }} style={styles.fotoAmpliadaModal} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function LinhaFotoPronta({
  uri,
  rotulo,
  aoAbrir,
  aoTirarNovamente,
}: {
  uri: string
  rotulo: string
  aoAbrir: () => void
  aoTirarNovamente: () => void
}) {
  return (
    <View style={styles.linhaFotoPronta}>
      <Pressable onPress={aoAbrir}>
        <Image source={{ uri }} style={styles.miniatura} resizeMode="cover" />
      </Pressable>
      <View style={styles.linhaFotoInfo}>
        <Text style={styles.fotoOk}>✓ {rotulo}</Text>
        <Pressable onPress={aoTirarNovamente} hitSlop={8}>
          <Text style={styles.linkTirarNovo}>🔄 Tirar de novo</Text>
        </Pressable>
      </View>
    </View>
  )
}

function BotaoFoto({
  onPress,
  carregando,
  texto,
}: {
  onPress: () => void
  carregando: boolean
  texto: string
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
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  botaoFechar: { padding: 6 },
  iconeFechar: { fontSize: 20, color: '#0f172a', fontWeight: '700' },
  tituloCabecalho: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  conteudo: { padding: 16, paddingBottom: 24 },
  rotulo: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  inputMultilinha: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  listaVeiculos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  vazio: { color: '#94a3b8', fontStyle: 'italic' },
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
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  chipSelecionado: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextoSelecionado: { color: '#fff' },
  listaFotos: { gap: 10 },
  linhaFotoPronta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniatura: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#e2e8f0' },
  linhaFotoInfo: { flex: 1, gap: 4 },
  fotoOk: { color: '#0f766e', fontWeight: '700', fontSize: 15 },
  linkTirarNovo: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  fundoModalFoto: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fotoAmpliadaModal: { width: '100%', height: '85%' },
  botaoFoto: { alignSelf: 'flex-start', backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoFotoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desabilitado: { opacity: 0.6 },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  botaoEnviar: { backgroundColor: '#0d9488', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoDesabilitado: { opacity: 0.4 },
  botaoEnviarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
