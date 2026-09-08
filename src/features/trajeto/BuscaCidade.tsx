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

/**
 * Busca de cidade em tela cheia: campo no topo, resultados no meio,
 * teclado embaixo.
 *
 * A lista já morou embutida no formulário, e ali o teclado cobria
 * justamente as sugestões -- o motorista digitava às cegas. Em tela
 * própria o campo fica fixo no alto e a lista ocupa só o espaço acima do
 * teclado, então o que se lê nunca fica atrás do que se digita.
 *
 * Quem monta este componente deve fazê-lo só quando for abrir: dois
 * <Modal> do RN visíveis ao mesmo tempo travam o iOS neste projeto.
 */
export function BuscaCidade({
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
      else if (contem.length < MAXIMO_RESULTADOS && item.chave.includes(alvo)) contem.push(item.municipio)
      if (comeca.length >= MAXIMO_RESULTADOS) break
    }
    return [...comeca, ...contem].slice(0, MAXIMO_RESULTADOS)
  }, [busca])

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <View style={estilos.tela}>
        <View style={estilos.cabecalho}>
          <Pressable onPress={aoFechar} hitSlop={10}>
            <Text style={estilos.cancelar}>Cancelar</Text>
          </Pressable>
          <Text style={estilos.titulo}>{titulo}</Text>
          {/* Espaçador do mesmo tamanho do "Cancelar" -- centraliza o
              título sem precisar medir texto. */}
          <Text style={[estilos.cancelar, estilos.invisivel]}>Cancelar</Text>
        </View>

        <KeyboardAvoidingView style={estilos.corpo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <Text style={estilos.vazio}>
                {normalizar(busca).length < 2 ? 'Digite pelo menos 2 letras.' : 'Nenhuma cidade encontrada.'}
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
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    // Recuo FIXO, não SafeAreaView: dentro de um <Modal> o
    // react-native-safe-area-context às vezes não calcula o inset (é
    // janela nativa separada) e o cabeçalho sobe por baixo da barra de
    // status -- o "Cancelar" fica ilegível e sem jeito de tocar. Foi
    // exatamente o que aconteceu aqui, e é a mesma armadilha que
    // CameraCustomizada.tsx já documenta desde o botão "Fechar" dela.
    // Valor generoso cobre notch e Dynamic Island sem depender do cálculo.
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  cancelar: { fontSize: 15, fontWeight: '600', color: '#0d9488' },
  invisivel: { opacity: 0 },
  titulo: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
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
  // Mesma razão do paddingTop: o indicador de início do iPhone comeria a
  // última linha da lista.
  lista: { flex: 1, paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
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
  vazio: { padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
})
