import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { capturarFoto } from '../../camera/capturarFoto'
import type { CategoriaSolicitacao, Veiculo } from '../../lib/tipos'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { TIPO_NOVA_SOLICITACAO, type FotoPayload, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { useVeiculos } from '../veiculos/useVeiculos'
import { obterFluxo, type DefinicaoPasso } from './fluxo'

/** '1.234,56' ou '1234.56' -> 1234.56, vazio/inválido -> 0 (o valor real
 *  costuma ser preenchido depois, o encarregado raramente sabe na hora). */
function paraNumero(texto: string): number {
  const limpo = texto.trim()
  if (!limpo) return 0
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

const ROTULO_CATEGORIA: Record<CategoriaSolicitacao, string> = {
  ABASTECIMENTO: '⛽ Abastecimento',
  'MANUTENÇÃO': '🔧 Manutenção',
  OUTRO: 'Outro',
}

export function NovaSolicitacaoFluxo({
  categoria,
  aoConcluir,
  aoCancelar,
}: {
  categoria: CategoriaSolicitacao
  aoConcluir: () => void
  aoCancelar: () => void
}) {
  const passos = obterFluxo(categoria)
  const { veiculos } = useVeiculos()

  const [passoAtual, setPassoAtual] = useState(0)
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [descricao, setDescricao] = useState('')
  const [fotos, setFotos] = useState<{ tipoFoto: string; uriLocal: string }[]>([])
  const [valorTexto, setValorTexto] = useState('')
  const [capturando, setCapturando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const passo = passos[passoAtual]

  function avancar() {
    setPassoAtual((p) => Math.min(p + 1, passos.length - 1))
  }

  function voltar() {
    if (passoAtual === 0) {
      aoCancelar()
      return
    }
    setPassoAtual((p) => p - 1)
  }

  async function tirarFotoUnica(def: DefinicaoPasso) {
    setCapturando(true)
    const uri = await capturarFoto()
    setCapturando(false)
    if (!uri) return
    setFotos((atual) => [...atual.filter((f) => f.tipoFoto !== def.tipoFoto), { tipoFoto: def.tipoFoto!, uriLocal: uri }])
    avancar()
  }

  async function tirarFotoMultipla() {
    setCapturando(true)
    const uri = await capturarFoto()
    setCapturando(false)
    if (!uri) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', uriLocal: uri }])
  }

  async function enviar() {
    setEnviando(true)
    const payload: NovaSolicitacaoPayload = {
      veiculoId: veiculo!.id,
      categoria,
      servico: categoria === 'ABASTECIMENTO' ? 'Abastecimento' : descricao.trim(),
      valor: paraNumero(valorTexto),
      fotos: fotos.map<FotoPayload>((f) => ({ uriLocal: f.uriLocal, tipo: f.tipoFoto, status: 'pendente' })),
    }
    await enfileirar(TIPO_NOVA_SOLICITACAO, payload)
    runSync()
    setEnviando(false)
    aoConcluir()
  }

  const fotoDoPasso = passo.tipoFoto ? fotos.find((f) => f.tipoFoto === passo.tipoFoto) : undefined
  const podeConfirmar =
    veiculo && (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotos.length > 0))

  return (
    <View style={styles.container}>
      <View style={styles.cabecalho}>
        <Text style={styles.tituloFluxo}>{ROTULO_CATEGORIA[categoria]}</Text>
        <Pressable onPress={aoCancelar} hitSlop={12}>
          <Text style={styles.cancelar}>Cancelar</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.corpo} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* respostas já dadas, resumidas, pra dar a sensação de conversa */}
        {veiculo && passoAtual > 0 && (
          <Resposta pergunta="Veículo" valor={`${veiculo.placa} — ${veiculo.modelo}`} />
        )}
        {categoria === 'MANUTENÇÃO' && passoAtual > 1 && descricao && (
          <Resposta pergunta="Descrição" valor={descricao} />
        )}

        {passo.tipo === 'veiculo' && (
          <View>
            <Pergunta texto={passo.pergunta} />
            <View style={styles.lista}>
              {veiculos.length === 0 && <Text style={styles.vazio}>Nenhum veículo disponível.</Text>}
              {veiculos.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => {
                    setVeiculo(v)
                    avancar()
                  }}
                  style={({ pressed }) => [styles.itemLista, pressed && styles.itemPressionado]}
                >
                  <Text style={styles.itemListaTexto}>
                    {v.placa} — {v.modelo}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {passo.tipo === 'texto' && (
          <View>
            <Pergunta texto={passo.pergunta} />
            <TextInput
              style={styles.inputMultilinha}
              value={descricao}
              onChangeText={setDescricao}
              multiline
              placeholder="Ex.: pneu furado, freio fazendo barulho..."
              autoFocus
            />
            <BotaoPrimario texto="Avançar" onPress={avancar} desabilitado={!descricao.trim()} />
          </View>
        )}

        {passo.tipo === 'foto_unica' && (
          <View>
            <Pergunta texto={passo.pergunta} />
            {fotoDoPasso ? (
              <Text style={styles.fotoOk}>✓ Foto registrada</Text>
            ) : (
              <BotaoPrimario
                texto="Tirar foto"
                onPress={() => tirarFotoUnica(passo)}
                carregando={capturando}
              />
            )}
          </View>
        )}

        {passo.tipo === 'foto_multipla' && (
          <View>
            <Pergunta texto={passo.pergunta} />
            <Text style={styles.contadorFotos}>{fotos.length} foto(s) adicionada(s)</Text>
            <BotaoSecundario texto="Tirar foto" onPress={tirarFotoMultipla} carregando={capturando} />
            <BotaoPrimario
              texto="Concluir fotos"
              onPress={avancar}
              desabilitado={fotos.length === 0}
            />
          </View>
        )}

        {passo.tipo === 'valor' && (
          <View>
            <Pergunta texto={passo.pergunta} />
            <TextInput
              style={styles.input}
              value={valorTexto}
              onChangeText={setValorTexto}
              keyboardType="decimal-pad"
              placeholder="Deixe em branco se não souber"
            />
            <BotaoPrimario texto="Avançar" onPress={avancar} />
          </View>
        )}

        {passo.tipo === 'confirmar' && (
          <View>
            <Pergunta texto="Tudo certo?" />
            <Resposta pergunta="Veículo" valor={veiculo ? `${veiculo.placa} — ${veiculo.modelo}` : '—'} />
            {fotos.length > 0 && <Resposta pergunta="Fotos" valor={`${fotos.length} anexada(s)`} />}
            <BotaoPrimario
              texto="Enviar solicitação"
              onPress={enviar}
              desabilitado={!podeConfirmar}
              carregando={enviando}
            />
          </View>
        )}
      </ScrollView>

      {passoAtual > 0 && passo.tipo !== 'confirmar' && (
        <Pressable onPress={voltar} style={styles.voltarLink} hitSlop={12}>
          <Text style={styles.voltarTexto}>← Voltar</Text>
        </Pressable>
      )}
    </View>
  )
}

function Pergunta({ texto }: { texto: string }) {
  return (
    <View style={styles.bolhaPergunta}>
      <Text style={styles.perguntaTexto}>{texto}</Text>
    </View>
  )
}

function Resposta({ pergunta, valor }: { pergunta: string; valor: string }) {
  return (
    <View style={styles.bolhaResposta}>
      <Text style={styles.respostaRotulo}>{pergunta}</Text>
      <Text style={styles.respostaTexto}>{valor}</Text>
    </View>
  )
}

function BotaoPrimario({
  texto,
  onPress,
  desabilitado,
  carregando,
}: {
  texto: string
  onPress: () => void
  desabilitado?: boolean
  carregando?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado || carregando}
      style={({ pressed }) => [
        styles.botaoPrimario,
        (pressed || desabilitado || carregando) && styles.botaoDesabilitado,
      ]}
    >
      {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoPrimarioTexto}>{texto}</Text>}
    </Pressable>
  )
}

function BotaoSecundario({
  texto,
  onPress,
  carregando,
}: {
  texto: string
  onPress: () => void
  carregando?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={carregando}
      style={({ pressed }) => [styles.botaoSecundario, pressed && styles.botaoDesabilitado]}
    >
      {carregando ? <ActivityIndicator /> : <Text style={styles.botaoSecundarioTexto}>{texto}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  tituloFluxo: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cancelar: { color: '#be123c', fontSize: 14, fontWeight: '600' },
  corpo: { flex: 1 },
  bolhaPergunta: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  perguntaTexto: { fontSize: 15, color: '#1e293b', fontWeight: '600' },
  bolhaResposta: {
    backgroundColor: '#0d9488',
    borderRadius: 14,
    borderBottomRightRadius: 4,
    padding: 12,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  respostaRotulo: { fontSize: 11, color: '#ccfbf1', fontWeight: '700', marginBottom: 2 },
  respostaTexto: { fontSize: 14, color: '#fff' },
  lista: { marginTop: 10, gap: 6 },
  vazio: { color: '#94a3b8', fontStyle: 'italic' },
  itemLista: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  itemPressionado: { backgroundColor: '#f1f5f9' },
  itemListaTexto: { fontSize: 15, color: '#0f172a' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputMultilinha: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 90,
    fontSize: 16,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  fotoOk: { marginTop: 10, color: '#0f766e', fontWeight: '700', fontSize: 15 },
  contadorFotos: { marginTop: 8, color: '#475569', fontSize: 13 },
  botaoPrimario: {
    marginTop: 12,
    backgroundColor: '#0d9488',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrimarioTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  botaoSecundario: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#0d9488',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoSecundarioTexto: { color: '#0d9488', fontSize: 15, fontWeight: '700' },
  botaoDesabilitado: { opacity: 0.5 },
  voltarLink: { padding: 14, alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  voltarTexto: { color: '#64748b', fontWeight: '600' },
})
