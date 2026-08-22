import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { CategoriaSolicitacao } from '../../lib/tipos'
import { MenuAnexo } from './MenuAnexo'
import type { FluxoSolicitacao } from './useFluxoSolicitacao'

/**
 * Rodapé estilo WhatsApp: "+" à esquerda (abre o menu de tipo de
 * solicitação), campo de texto no meio, ícone de ação à direita. O campo
 * e o ícone são contextuais ao passo atual do roteiro -- nunca livres:
 * só respondem ao que o passo pede (descrição, valor, confirmar), nunca
 * tentam "entender" um texto qualquer.
 */
export function BarraEntrada({
  fluxo,
  onNovaCategoria,
  onConcluido,
}: {
  fluxo: FluxoSolicitacao | null
  onNovaCategoria: (categoria: CategoriaSolicitacao) => void
  onConcluido: () => void
}) {
  const [texto, setTexto] = useState('')

  // Limpa o campo ao trocar de passo -- o texto do passo anterior não
  // deve "vazar" pro próximo.
  useEffect(() => {
    setTexto('')
  }, [fluxo?.passo.id])

  const passo = fluxo?.passo

  let placeholder = 'Toque em + para iniciar uma solicitação'
  let editavel = false
  let tecladoNumerico = false
  if (passo?.tipo === 'texto') {
    placeholder = passo.pergunta
    editavel = true
  } else if (passo?.tipo === 'valor') {
    placeholder = passo.pergunta
    editavel = true
    tecladoNumerico = true
  } else if (passo?.tipo === 'veiculo') {
    placeholder = 'Escolha um veículo acima ↑'
  } else if (passo?.tipo === 'foto_unica' || passo?.tipo === 'foto_multipla') {
    placeholder = 'Toque em 📷 acima ↑'
  } else if (passo?.tipo === 'confirmar') {
    placeholder = 'Revise a solicitação acima ↑'
  }

  async function aoTocarEnviar() {
    if (!fluxo || !passo) return

    if (passo.tipo === 'confirmar') {
      if (!fluxo.podeConfirmar) return
      await fluxo.enviarSolicitacao()
      onConcluido()
      return
    }

    if (passo.tipo === 'texto' || passo.tipo === 'valor') {
      fluxo.enviarTexto(texto)
    }
  }

  const habilitaEnviar =
    passo?.tipo === 'valor' ||
    (passo?.tipo === 'texto' && texto.trim().length > 0) ||
    (passo?.tipo === 'confirmar' && fluxo?.podeConfirmar)

  const iconeEnviar = passo?.tipo === 'confirmar' ? '✓' : '➤'

  return (
    <View style={styles.barra}>
      <MenuAnexo onEscolher={onNovaCategoria} desabilitado={Boolean(fluxo)} />

      <TextInput
        style={[styles.campo, !editavel && styles.campoDesabilitado]}
        value={texto}
        onChangeText={setTexto}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        editable={editavel}
        pointerEvents={editavel ? 'auto' : 'none'}
        keyboardType={tecladoNumerico ? 'decimal-pad' : 'default'}
        onSubmitEditing={aoTocarEnviar}
        returnKeyType="send"
      />

      <Pressable
        onPress={aoTocarEnviar}
        disabled={!habilitaEnviar || fluxo?.enviando}
        style={[styles.botaoEnviar, (!habilitaEnviar || fluxo?.enviando) && styles.botaoDesabilitado]}
      >
        {fluxo?.enviando ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.iconeEnviar}>{iconeEnviar}</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  campo: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#0d9488',
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  campoDesabilitado: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoDesabilitado: { backgroundColor: '#cbd5e1' },
  iconeEnviar: { color: '#fff', fontSize: 19, fontWeight: '700' },
})
