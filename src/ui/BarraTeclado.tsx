import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * Barra com "Concluído" por cima do teclado, no iOS.
 *
 * Os teclados numéricos do iOS (`decimal-pad`, `number-pad`) não têm
 * tecla de retorno -- literalmente não existe botão pra fechar. Em campo
 * de texto comum dá pra tocar fora e sair, mas num formulário rolável o
 * teclado cobre metade da tela e o toque cai em cima de outro campo. Foi
 * o que o usuário relatou: "às vezes o teclado não fecha depois de
 * concluir a digitação".
 *
 * No Android não é montada: lá o botão/gesto de voltar já fecha o
 * teclado, e uma barra a mais só ocuparia espaço.
 *
 * Uso: renderize <BarraTeclado /> uma vez na tela e passe
 * `inputAccessoryViewID={ID_BARRA_TECLADO}` nos campos numéricos.
 */
export const ID_BARRA_TECLADO = 'barraTecladoConcluido'

export function BarraTeclado() {
  if (Platform.OS !== 'ios') return null

  return (
    <InputAccessoryView nativeID={ID_BARRA_TECLADO}>
      <View style={estilos.barra}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={12}>
          <Text style={estilos.texto}>Concluído</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}

const estilos = StyleSheet.create({
  barra: {
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  texto: { fontSize: 16, fontWeight: '700', color: '#0d9488' },
})
