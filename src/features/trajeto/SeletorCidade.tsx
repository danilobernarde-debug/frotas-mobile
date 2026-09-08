import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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

const MAXIMO_SUGESTOES = 8

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
  const [busca, setBusca] = useState('')
  const [trocando, setTrocando] = useState(false)

  const sugestoes = useMemo(() => {
    const alvo = normalizar(busca)
    if (alvo.length < 2) return []
    // Quem começa com o que foi digitado vem antes: "pal" tem que trazer
    // Palmas no topo, não "Espírito Santo do Pinhal".
    const comeca: Municipio[] = []
    const contem: Municipio[] = []
    for (const item of obterIndice()) {
      if (item.chave.startsWith(alvo)) comeca.push(item.municipio)
      else if (contem.length < MAXIMO_SUGESTOES && item.chave.includes(alvo)) contem.push(item.municipio)
      if (comeca.length >= MAXIMO_SUGESTOES) break
    }
    return [...comeca, ...contem].slice(0, MAXIMO_SUGESTOES)
  }, [busca])

  const mostrarBusca = !valor || trocando

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

      {mostrarBusca ? (
        <>
          <TextInput
            style={estilos.campo}
            value={busca}
            onChangeText={setBusca}
            placeholder="Digite o nome da cidade"
            placeholderTextColor="#94a3b8"
            autoCorrect={false}
            autoFocus={trocando}
          />
          {/* Lista simples, não FlatList: são no máximo 8 itens dentro do
              ScrollView do formulário, e lista rolável dentro de outra
              rouba o gesto de rolagem da tela. */}
          {sugestoes.length > 0 && (
            <View style={estilos.sugestoes}>
              {sugestoes.map((m) => (
                <Pressable
                  key={`${m[0]}-${m[1]}`}
                  onPress={() => {
                    aoEscolher(m)
                    setBusca('')
                    setTrocando(false)
                  }}
                  style={estilos.sugestao}
                >
                  <Text style={estilos.sugestaoNome}>{m[0]}</Text>
                  <Text style={estilos.sugestaoUf}>{m[1]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        // Escolhida vira uma linha fechada: manter o campo de busca aberto
        // convidaria a redigitar o que já está certo.
        <Pressable
          onPress={() => {
            setBusca('')
            setTrocando(true)
          }}
          style={estilos.escolhida}
        >
          <Text style={estilos.escolhidaTexto}>
            {valor[0]} — {valor[1]}
          </Text>
          <Text style={estilos.trocar}>Trocar</Text>
        </Pressable>
      )}
    </View>
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
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    marginTop: 6,
  },
  escolhida: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
  },
  escolhidaTexto: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: '#0f766e' },
  trocar: { fontSize: 13, fontWeight: '600', color: '#0d9488' },
  sugestoes: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  sugestao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  sugestaoNome: { flexShrink: 1, fontSize: 15, color: '#0f172a' },
  sugestaoUf: { fontSize: 13, fontWeight: '700', color: '#64748b' },
})
