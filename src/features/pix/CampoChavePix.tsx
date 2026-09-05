import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { NOME_TIPO_CHAVE } from '../../lib/chavePix'
import type { ChavePixControlada } from './useChavePix'

/**
 * Campo de chave PIX com máscara automática, o retorno do que foi
 * reconhecido e, no caso ambíguo, as abas CPF/Celular.
 *
 * Teclado comum de propósito: sem escolher o tipo antes, não dá pra saber
 * se vem número ou e-mail, e o numérico trancaria quem for digitar
 * e-mail ou chave aleatória.
 */
export function CampoChavePix({
  chave,
  aoLerQr,
  lendoQr,
}: {
  chave: ChavePixControlada
  /** Quando passado, o campo ganha o ícone de QR à direita -- como nos
   *  aplicativos de banco. Sem ele, o campo é só de digitação. */
  aoLerQr?: () => void
  lendoQr?: boolean
}) {
  return (
    <>
      {/* Ícone DENTRO do campo, e não um botão largo acima: ler o QR é
          uma alternativa a digitar a chave, não uma etapa à parte -- e é
          onde a mão já está quando se olha pro campo. */}
      <View style={estilos.caixa}>
        <TextInput
          style={estilos.campo}
          value={chave.texto}
          onChangeText={chave.alterar}
          placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {aoLerQr && (
          <Pressable onPress={aoLerQr} disabled={lendoQr} hitSlop={10} style={estilos.botaoQr}>
            {lendoQr ? (
              <ActivityIndicator size="small" color="#0d9488" />
            ) : (
              <Ionicons name="qr-code-outline" size={24} color="#0d9488" />
            )}
          </Pressable>
        )}
      </View>

      {/* Sem dúvida nenhuma: só confirma o que reconheceu, pra pessoa
          conferir em vez de declarar o tipo antes. */}
      {chave.tipo && chave.completa && !chave.aviso && !chave.opcoes && (
        <Text style={estilos.reconhecida}>✓ Reconhecido como {NOME_TIPO_CHAVE[chave.tipo]}</Text>
      )}

      {/* Com dúvida: os 11 dígitos fecham o dígito verificador do CPF E
          têm formato de celular. Nenhuma regra local decide isso, então
          quem está com o número na frente é que decide -- em abas
          visíveis, não num link discreto que passa despercebido bem na
          hora em que a escolha importa. */}
      {chave.opcoes && (
        <>
          <Text style={estilos.pergunta}>Esses números valem como CPF e como celular. Qual dos dois é?</Text>
          <View style={estilos.abas}>
            {chave.opcoes.map((t) => (
              <Pressable
                key={t}
                onPress={() => chave.escolherTipo(t)}
                style={[estilos.aba, chave.tipo === t && estilos.abaAtiva]}
              >
                <Text style={[estilos.abaTexto, chave.tipo === t && estilos.abaTextoAtivo]}>
                  {NOME_TIPO_CHAVE[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* A frase vem pronta do módulo -- cada motivo (CPF que não fecha,
          CNPJ que não fecha, números demais) pede uma diferente, e quem
          sabe qual é o motivo é quem identificou. */}
      {chave.aviso && <Text style={estilos.aviso}>{chave.aviso}</Text>}
    </>
  )
}

const estilos = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  campo: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#0f172a' },
  botaoQr: { paddingLeft: 10, paddingVertical: 8 },
  reconhecida: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#0f766e' },
  aviso: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#b45309' },
  pergunta: { marginTop: 8, fontSize: 13, color: '#475569' },
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  aba: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  abaAtiva: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  abaTexto: { fontSize: 14, fontWeight: '600', color: '#334155' },
  abaTextoAtivo: { color: '#fff' },
})
