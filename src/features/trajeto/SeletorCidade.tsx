import { useMemo, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MUNICIPIOS, type Municipio } from '../../lib/municipios'

/** Sem acento e em minúsculas -- quem digita "goiania" no teclado do
 *  celular espera achar "Goiânia". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Índice montado UMA vez, na primeira busca, e não a cada tecla: são
 * 5.571 municípios, e normalizar todos a cada letra digitada trava o
 * teclado em aparelho fraco -- que é o que o motorista tem.
 */
let indice: { chave: string; municipio: Municipio }[] | null = null
function obterIndice() {
  if (!indice) {
    indice = MUNICIPIOS.map((m) => ({
      chave: `${normalizar(m[0])} ${m[1].toLowerCase()}`,
      municipio: m,
    }))
  }
  return indice
}

const MAXIMO_RESULTADOS = 60

export function SeletorCidade({
  rotulo,
  valor,
  aoEscolher,
  aoRemover,
}: {
  rotulo: string
  valor: Municipio | null
  aoEscolher: (m: Municipio) => void
  /** Só nas paradas que dá pra tirar -- origem e destino não somem. */
  aoRemover?: () => void
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <View style={estilos.bloco}>
      <View style={estilos.linhaRotulo}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        {aoRemover && (
          <Pressable onPress={aoRemover} hitSlop={10}>
            <Text style={estilos.remover}>Remover</Text>
          </Pressable>
        )}
      </View>

      <Pressable onPress={() => setAberto(true)} style={[estilos.campo, valor && estilos.campoPreenchido]}>
        <Text style={valor ? estilos.valorTexto : estilos.vazioTexto}>
          {valor ? `${valor[0]} — ${valor[1]}` : 'Escolher cidade'}
        </Text>
      </Pressable>

      {/* Montado só quando aberto: neste projeto dois <Modal> do RN
          visíveis ao mesmo tempo travam o iOS (a tela da solicitação já
          tem o modal da foto ampliada), e um formulário com 3 paradas
          teria 3 destes pendurados. Montando sob demanda, nunca existe
          mais de um. */}
      {aberto && (
        <BuscaCidade
          titulo={rotulo}
          aoFechar={() => setAberto(false)}
          aoEscolher={(m) => {
            aoEscolher(m)
            setAberto(false)
          }}
        />
      )}
    </View>
  )
}

/**
 * Busca em tela cheia: campo no topo, resultados no meio, teclado
 * embaixo.
 *
 * A lista morava embutida no formulário e o teclado cobria justamente as
 * sugestões -- o motorista digitava às cegas. Em tela própria o campo
 * fica fixo no alto e a lista ocupa só o espaço acima do teclado
 * (KeyboardAvoidingView), então o que ele está lendo nunca fica atrás do
 * que ele está digitando.
 */
function BuscaCidade({
  titulo,
  aoFechar,
  aoEscolher,
}: {
  titulo: string
  aoFechar: () => void
  aoEscolher: (m: Municipio) => void
}) {
  const [busca, setBusca] = useState('')

  const resultados = useMemo(() => {
    const alvo = normalizar(busca)
    if (alvo.length < 2) return []
    // Quem começa com o que foi digitado vem antes: "pal" tem que trazer
    // Palmas no topo, não "Espírito Santo do Pinhal".
    const comeca: Municipio[] = []
    const contem: Municipio[] = []
    for (const item of obterIndice()) {
      if (item.chave.startsWith(alvo)) comeca.push(item.municipio)
      else if (contem.length < MAXIMO_RESULTADOS) {
        if (item.chave.includes(alvo)) contem.push(item.municipio)
      }
      if (comeca.length >= MAXIMO_RESULTADOS) break
    }
    return [...comeca, ...contem].slice(0, MAXIMO_RESULTADOS)
  }, [busca])

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <SafeAreaView style={estilos.tela} edges={['top', 'bottom']}>
        <View style={estilos.cabecalho}>
          <Pressable onPress={aoFechar} hitSlop={10}>
            <Text style={estilos.cancelar}>Cancelar</Text>
          </Pressable>
          <Text style={estilos.tituloTela}>{titulo}</Text>
          {/* Espaçador da mesma largura do "Cancelar", pra centralizar o
              título sem medir texto. */}
          <Text style={[estilos.cancelar, estilos.invisivel]}>Cancelar</Text>
        </View>

        <KeyboardAvoidingView
          style={estilos.corpo}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TextInput
            style={estilos.campoBusca}
            value={busca}
            onChangeText={setBusca}
            placeholder="Digite o nome da cidade"
            placeholderTextColor="#94a3b8"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
          />

          <FlatList
            style={estilos.lista}
            data={resultados}
            keyExtractor={(m) => `${m[0]}-${m[1]}`}
            // "handled": tocar num resultado escolhe direto, sem gastar o
            // primeiro toque só pra fechar o teclado.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <Text style={estilos.vazioLista}>
                {normalizar(busca).length < 2
                  ? 'Digite pelo menos 2 letras.'
                  : 'Nenhuma cidade encontrada.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => aoEscolher(item)} style={estilos.resultado}>
                <Text style={estilos.resultadoNome}>{item[0]}</Text>
                <Text style={estilos.resultadoUf}>{item[1]}</Text>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  bloco: { marginTop: 12 },
  linhaRotulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotulo: { fontSize: 13, fontWeight: '700', color: '#334155' },
  remover: { fontSize: 13, fontWeight: '600', color: '#be123c' },
  campo: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 6,
  },
  campoPreenchido: { backgroundColor: '#f0fdfa', borderColor: '#99f6e4' },
  valorTexto: { fontSize: 16, fontWeight: '700', color: '#0f766e' },
  vazioTexto: { fontSize: 16, color: '#94a3b8' },

  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  cancelar: { fontSize: 15, fontWeight: '600', color: '#0d9488' },
  invisivel: { opacity: 0 },
  tituloTela: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  corpo: { flex: 1 },
  campoBusca: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#0f172a',
  },
  lista: { flex: 1 },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  resultadoNome: { flexShrink: 1, fontSize: 16, color: '#0f172a' },
  resultadoUf: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  vazioLista: { padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
})
