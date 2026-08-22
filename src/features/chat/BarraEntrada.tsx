import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { CategoriaSolicitacao } from '../../lib/tipos'
import { TIPO_MENSAGEM, type MensagemPayload } from '../../outbox/handlers/mensagem'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { MenuAnexo } from './MenuAnexo'
import type { FluxoSolicitacao } from './useFluxoSolicitacao'

/**
 * Rodapé estilo WhatsApp: "+" à esquerda (abre o menu de tipo de
 * solicitação), campo de texto no meio, ícone de ação à direita.
 *
 * Sem fluxo ativo (`fluxo === null`), o campo é uma mensagem livre pra
 * gestão de frotas -- digitar e tocar em ➤ enfileira e limpa, sem
 * precisar de nenhum roteiro guiado. Com fluxo ativo, o campo continua
 * 100% contextual ao passo (como já era): só responde ao que aquele
 * passo pede (descrição, valor, confirmar), nunca tenta "entender" um
 * texto qualquer -- os dois modos não se confundem porque o estado
 * ocioso e o fluxo ativo são duas instâncias montadas separadamente
 * (troca por `key` em chat.tsx), o texto digitado num nunca vaza pro outro.
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
  const [enviandoMensagem, setEnviandoMensagem] = useState(false)

  // Limpa o campo ao trocar de passo -- o texto do passo anterior não
  // deve "vazar" pro próximo.
  useEffect(() => {
    setTexto('')
  }, [fluxo?.passo.id])

  const passo = fluxo?.passo

  let placeholder = 'Escreva uma mensagem…'
  let editavel = true
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
    editavel = false
  } else if (passo?.tipo === 'foto_unica' || passo?.tipo === 'foto_multipla') {
    placeholder = 'Toque em 📷 acima ↑'
    editavel = false
  } else if (passo?.tipo === 'confirmar') {
    placeholder = 'Revise a solicitação acima ↑'
    editavel = false
  }

  async function enviarMensagemLivre() {
    const digitado = texto.trim()
    if (!digitado) return
    setEnviandoMensagem(true)
    await enfileirar<MensagemPayload>(TIPO_MENSAGEM, { texto: digitado })
    runSync()
    setTexto('')
    setEnviandoMensagem(false)
    onConcluido()
  }

  async function aoTocarEnviar() {
    if (!fluxo) {
      await enviarMensagemLivre()
      return
    }
    if (!passo) return

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

  const habilitaEnviar = fluxo
    ? passo?.tipo === 'valor' ||
      (passo?.tipo === 'texto' && texto.trim().length > 0) ||
      (passo?.tipo === 'confirmar' && fluxo?.podeConfirmar)
    : texto.trim().length > 0

  const iconeEnviar = passo?.tipo === 'confirmar' ? '✓' : '➤'
  const enviandoAlgo = fluxo?.enviando || enviandoMensagem

  return (
    <View style={styles.barra}>
      {/* Desabilita "+" também enquanto há rascunho não enviado no campo
          -- sem isso, tocar em + no meio de digitar uma mensagem
          descarta o texto em silêncio (a barra ociosa desmonta ao trocar
          pro fluxo guiado). Força "envie ou limpe antes de iniciar um
          novo pedido" em vez de perder o rascunho sem aviso. */}
      <MenuAnexo onEscolher={onNovaCategoria} desabilitado={Boolean(fluxo) || texto.trim().length > 0} />

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
        disabled={!habilitaEnviar || enviandoAlgo}
        style={[styles.botaoEnviar, (!habilitaEnviar || enviandoAlgo) && styles.botaoDesabilitado]}
      >
        {enviandoAlgo ? (
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
