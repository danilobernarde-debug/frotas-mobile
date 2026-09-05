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
import { FotoAmpliada } from '../../src/camera/FotoAmpliada'
import { PreviaMarcaDagua } from '../../src/camera/PreviaMarcaDagua'
import { CampoChavePix } from '../../src/features/pix/CampoChavePix'
import { useFormularioSolicitacao } from '../../src/features/chat/useFormularioSolicitacao'
import { useVeiculos } from '../../src/features/veiculos/useVeiculos'
import { moeda } from '../../src/lib/formato'
import { TIPOS_COMBUSTIVEL, type CategoriaSolicitacao } from '../../src/lib/tipos'

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
          {formulario.motoristaNome && (
            <Text style={styles.motoristaVinculado}>🚗 Motorista: {formulario.motoristaNome}</Text>
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
            /* Um pedido de abastecimento não tem o que preencher: quem
               pede ainda não sabe quanto vai pôr, e KM, litros, preço e
               as fotos da bomba só existem DEPOIS de abastecer. Pedir
               isso aqui obrigava o motorista a já ter abastecido pra
               conseguir pedir autorização. */
            <View style={styles.explicacao}>
              <Text style={styles.explicacaoTitulo}>É só pedir</Text>
              <Text style={styles.explicacaoTexto}>
                O gestor responde quanto você pode abastecer. Depois de abastecer, abra
                esta solicitação e informe os litros, o preço e as fotos.
              </Text>
            </View>
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

              <Text style={styles.rotulo}>Valor estimado (opcional)</Text>
              <TextInput
                style={styles.input}
                value={formulario.valor}
                onChangeText={formulario.setValor}
                keyboardType="decimal-pad"
                placeholder="R$"
                placeholderTextColor="#94a3b8"
              />
            </>
          )}

          {/* Fotos e PIX só na MANUTENÇÃO. No abastecimento os dois
              pertencem ao depois: as fotos da bomba e do hodômetro só
              existem com o carro abastecido, e a chave do recebedor o
              motorista só vê quando chega no posto. Os dois aparecem na
              tela da solicitação, na hora de completar. */}
          {categoria !== 'ABASTECIMENTO' && (
            <>
            <Text style={styles.rotulo}>Fotos</Text>
            <View style={styles.listaFotos}>
              {formulario.fotosProblema.map((foto, indice) => (
                <LinhaFotoPronta
                  key={foto.uriLocal}
                  foto={foto}
                  rotulo={`Foto ${indice + 1}`}
                  nomeMotorista={formulario.motoristaNome}
                  placa={formulario.veiculo?.placa}
                  aoAbrir={() => setFotoAberta(foto.uriLocal)}
                  aoTirarNovamente={() => formulario.substituirFotoMultipla(foto.uriLocal)}
                />
              ))}
              <BotaoFoto
                onPress={formulario.tirarFotoMultipla}
                carregando={formulario.capturando}
                texto={formulario.fotosProblema.length > 0 ? 'Tirar outra foto' : 'Tirar foto'}
              />
            </View>

            {/* Pagamento -- o posto/oficina quase nunca é fornecedor
                cadastrado, então a chave vem na hora, com o motorista lá.
                Os dois campos são opcionais de propósito: nem todo
                recebedor mostra QR pra fotografar, e nem toda solicitação
                já nasce com a chave em mãos. Quem paga confere a chave
                digitada contra a foto. */}
            <Text style={styles.tituloSecao}>Pagamento (PIX)</Text>
            <Text style={styles.ajudaSecao}>
              Aponte a câmera para o QR Code do recebedor: a foto sai sozinha e a
              chave é preenchida sem digitar nada. Não tem QR? Tire a foto e
              digite a chave abaixo.
            </Text>

            {/* A foto vem ANTES do campo de propósito: ela é que preenche a
                chave. Pedir a chave primeiro convidava a digitar à mão o que
                a câmera resolve sozinha um toque depois. */}
            <Text style={styles.rotulo}>Foto da chave ou do QR Code</Text>
            <View style={styles.listaFotos}>
              {formulario.fotoPix ? (
                <View style={styles.cartaoFotoPronta}>
                  <Pressable
                    onPress={() => setFotoAberta(formulario.fotoPix!.uriLocal)}
                    style={styles.miniaturaContainer}
                  >
                    <Image
                      source={{ uri: formulario.fotoPix.uriLocal }}
                      style={styles.miniatura}
                      resizeMode="cover"
                    />
                  </Pressable>
                  <View style={styles.linhaFotoInfo}>
                    <Text style={styles.fotoOk}>✓ Foto do PIX</Text>
                    <View style={styles.acoesFoto}>
                      <Pressable onPress={() => formulario.tirarFotoSlot('PIX')} hitSlop={8}>
                        <Text style={styles.linkTirarNovo}>🔄 Tirar de novo</Text>
                      </Pressable>
                      <Pressable onPress={() => formulario.removerFotoSlot('PIX')} hitSlop={8}>
                        <Text style={styles.linkRemover}>Remover</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <BotaoFoto
                  onPress={() => formulario.tirarFotoSlot('PIX')}
                  carregando={formulario.capturando}
                  texto="Ler QR Code ou tirar foto"
                />
              )}
            </View>

            {/* Um campo só, sem escolher o tipo: a pontuação e o tipo saem
                sozinhos do que foi digitado. Mesmo componente da tela da
                solicitação já enviada, onde a chave pode ser completada
                depois -- chave tratada de dois jeitos diferentes é o tipo
                de divergência que acaba em pagamento errado. */}
            <Text style={styles.rotulo}>Chave PIX</Text>
            <CampoChavePix chave={formulario.chavePix} />
            {/* O motorista precisa saber de onde veio o que está no campo --
                principalmente pra conferir antes de enviar, já que é pra
                onde o dinheiro vai. */}
            {formulario.origemChavePix === 'qr' && (
              <Text style={styles.avisoBom}>✓ Chave lida do QR Code. Confira antes de enviar.</Text>
            )}
            {formulario.origemChavePix === 'qr-dinamico' && (
              <Text style={styles.aviso}>
                Esse QR Code é de cobrança e não contém a chave. Digite a chave acima.
              </Text>
            )}
            {formulario.origemChavePix === 'qr-sem-chave' && (
              <Text style={styles.aviso}>Não achei um QR Code de PIX na foto. Digite a chave acima.</Text>
            )}
            </>
          )}

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
          {fotoAberta &&
            (() => {
              const foto = formulario.fotos.find((f) => f.uriLocal === fotoAberta)
              // A do PIX abre limpa (sem a faixa) -- é o que vai ser
              // salvo de verdade nela, ver tirarFotoSlot.
              if (foto?.tipoFoto === 'PIX') return <FotoAmpliada uri={fotoAberta} />
              return (
                <FotoAmpliada
                  uri={fotoAberta}
                  capturadaEm={foto?.capturadaEm}
                  nomeMotorista={formulario.motoristaNome}
                  placa={formulario.veiculo?.placa}
                  latitude={foto?.latitude}
                  longitude={foto?.longitude}
                  localizacaoRotulo={foto?.localizacaoRotulo}
                />
              )
            })()}
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function LinhaFotoPronta({
  foto,
  rotulo,
  nomeMotorista,
  placa,
  aoAbrir,
  aoTirarNovamente,
}: {
  foto: { uriLocal: string; capturadaEm?: string; latitude?: number; longitude?: number; localizacaoRotulo?: string }
  rotulo: string
  nomeMotorista?: string | null
  placa?: string | null
  aoAbrir: () => void
  aoTirarNovamente: () => void
}) {
  return (
    <View style={styles.cartaoFotoPronta}>
      <Pressable onPress={aoAbrir} style={styles.miniaturaContainer}>
        <Image source={{ uri: foto.uriLocal }} style={styles.miniatura} resizeMode="cover" />
        <PreviaMarcaDagua
          capturadaEm={foto.capturadaEm}
          nomeMotorista={nomeMotorista}
          placa={placa}
          latitude={foto.latitude}
          longitude={foto.longitude}
          localizacaoRotulo={foto.localizacaoRotulo}
        />
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
  valorCalculado: { marginTop: 10, fontSize: 15, fontWeight: '700', color: '#0f766e' },
  listaVeiculos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  explicacao: {
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  explicacaoTitulo: { fontSize: 15, fontWeight: '800', color: '#0f766e' },
  explicacaoTexto: { fontSize: 13, color: '#115e59', marginTop: 4, lineHeight: 19 },
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
  listaFotos: { gap: 14 },
  cartaoFotoPronta: { gap: 6 },
  // relative (padrão do RN pra View) -- é o que ancora a faixa da prévia
  // (position: absolute) exatamente sobre a miniatura, não a tela toda.
  miniaturaContainer: { borderRadius: 10, overflow: 'hidden' },
  // Bem maior que antes (era 56x56): pequena demais pra caber as linhas
  // da prévia da marca d'água de um jeito legível (pedido do usuário).
  miniatura: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#e2e8f0' },
  linhaFotoInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  acoesFoto: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fotoOk: { color: '#0f766e', fontWeight: '700', fontSize: 15 },
  linkTirarNovo: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  linkRemover: { color: '#be123c', fontWeight: '600', fontSize: 14 },
  tituloSecao: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  ajudaSecao: { fontSize: 13, color: '#64748b', marginTop: 4 },
  avisoBom: { fontSize: 13, color: '#0f766e', fontWeight: '600', marginTop: 8 },
  aviso: { fontSize: 13, color: '#b45309', marginTop: 8 },
  fundoModalFoto: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  botaoFoto: { alignSelf: 'flex-start', backgroundColor: '#0d9488', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoFotoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desabilitado: { opacity: 0.6 },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  botaoEnviar: { backgroundColor: '#0d9488', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  botaoDesabilitado: { opacity: 0.4 },
  botaoEnviarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
