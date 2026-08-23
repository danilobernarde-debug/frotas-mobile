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
  } else if (passo?.tipo === 'valor' || passo?.tipo === 'km') {
    placeholder = passo.pergunta
    editavel = true
    tecladoNumerico = true
  } else if (passo?.tipo === 'veiculo') {
    placeholder = 'Escolha um veículo acima ↑'
    editavel = false
  } else if (passo?.tipo === 'fotos_abastecimento' || passo?.tipo === 'foto_multipla') {
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

    if (passo.tipo === 'texto' || passo.tipo === 'valor' || passo.tipo === 'km') {
      fluxo.enviarTexto(texto)
      return
    }

    if (passo.tipo === 'foto_multipla' || passo.tipo === 'fotos_abastecimento') {
      fluxo.avancar()
    }
  }

  // fotos_abastecimento: só habilita quando TODAS as fotos fixas do passo
  // (lidas do próprio passo, não repetidas aqui -- ver fluxo.ts) já foram
  // tiradas, não só uma qualquer (diferente de foto_multipla, onde 1 já basta).
  const todasFotosFixasProntas = Boolean(
    fluxo && passo?.tipo === 'fotos_abastecimento' && passo.slots?.every((s) => fluxo.fotos.some((f) => f.tipoFoto === s.tipoFoto)),
  )

  const habilitaEnviar = fluxo
    ? passo?.tipo === 'valor' ||
      ((passo?.tipo === 'texto' || passo?.tipo === 'km') && texto.trim().length > 0) ||
      (passo?.tipo === 'foto_multipla' && fluxo.fotos.length > 0) ||
      todasFotosFixasProntas ||
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
        // multiline: o campo cresce junto com o texto (até maxHeight, depois
        // rola por dentro) -- igual WhatsApp. returnKeyType="send" +
        // onSubmitEditing (versão anterior) fazia o Enter DISPARAR o envio
        // em vez de quebrar linha -- exatamente o contrário do que o
        // WhatsApp faz. Enter aqui só quebra linha; enviar é só pelo ➤.
        multiline
        returnKeyType="default"
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
    // flex-end (não 'center'): conforme o campo cresce com o texto, o "+"
    // e o botão de enviar ficam ancorados embaixo, igual WhatsApp -- com
    // 'center' os dois ficariam flutuando no meio da altura toda.
    alignItems: 'flex-end',
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
    paddingVertical: 10,
    // minHeight/maxHeight (não height fixo): é isso que deixa o RN
    // crescer o campo sozinho conforme o texto quebra linha, até um teto
    // de ~5 linhas, depois passa a rolar por dentro em vez de crescer.
    minHeight: 44,
    maxHeight: 120,
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
