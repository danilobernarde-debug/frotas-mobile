import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { CategoriaSolicitacao } from '../../lib/tipos'
import { TIPO_MENSAGEM, type MensagemPayload } from '../../outbox/handlers/mensagem'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { MenuAnexo } from './MenuAnexo'
import type { RespondendoA } from './types'

/**
 * Rodapé estilo WhatsApp: "+" à esquerda (abre o menu de tipo de
 * solicitação -- que agora navega pra tela cheia de formulário, não
 * inicia mais um roteiro guiado dentro do próprio chat), campo de texto
 * no meio, ícone de enviar à direita. O campo é sempre mensagem livre pra
 * gestão de frotas -- digitar e tocar em ➤ enfileira e limpa.
 */
export function BarraEntrada({
  onNovaCategoria,
  onConcluido,
  respondendoA,
  aoLimparResposta,
}: {
  onNovaCategoria: (categoria: CategoriaSolicitacao) => void
  onConcluido: () => void
  respondendoA?: RespondendoA | null
  aoLimparResposta?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function aoTocarEnviar() {
    const digitado = texto.trim()
    if (!digitado) return
    setEnviando(true)
    await enfileirar<MensagemPayload>(TIPO_MENSAGEM, {
      texto: digitado,
      respondendoA: respondendoA?.tipo === 'mensagem' ? respondendoA.id : undefined,
      respondendoAprovacaoId: respondendoA?.tipo === 'solicitacao' ? respondendoA.id : undefined,
    })
    runSync()
    setTexto('')
    setEnviando(false)
    aoLimparResposta?.()
    onConcluido()
  }

  const habilitaEnviar = texto.trim().length > 0

  return (
    <View>
      {respondendoA && (
        <View style={styles.respondendoBarra}>
          <View style={styles.respondendoLinha} />
          <View style={styles.respondendoInfo}>
            <Text style={styles.respondendoAutor}>{respondendoA.titulo}</Text>
            <Text style={styles.respondendoTexto} numberOfLines={1}>
              {respondendoA.texto}
            </Text>
          </View>
          <Pressable onPress={aoLimparResposta} hitSlop={8}>
            <Text style={styles.respondendoFechar}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.barra}>
        <MenuAnexo onEscolher={onNovaCategoria} />

        <TextInput
          style={styles.campo}
          value={texto}
          onChangeText={setTexto}
          placeholder="Escreva uma mensagem…"
          placeholderTextColor="#94a3b8"
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
          disabled={!habilitaEnviar || enviando}
          style={[styles.botaoEnviar, (!habilitaEnviar || enviando) && styles.botaoDesabilitado]}
        >
          {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.iconeEnviar}>➤</Text>}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  respondendoBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  respondendoLinha: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#0d9488' },
  respondendoInfo: { flex: 1 },
  respondendoAutor: { fontSize: 12, fontWeight: '700', color: '#0f766e' },
  respondendoTexto: { fontSize: 12, color: '#64748b' },
  respondendoFechar: { fontSize: 16, color: '#94a3b8', paddingHorizontal: 4 },
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
