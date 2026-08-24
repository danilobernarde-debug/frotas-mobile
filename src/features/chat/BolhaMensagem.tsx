import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import { hora } from '../../lib/formato'
import type { EntradaChat, RespondendoA } from './types'

/**
 * Alinha a mensagem à direita se foi o próprio encarregado que escreveu,
 * à esquerda se é resposta da gestão -- comparando autor_id com o
 * perfil logado (seguro porque o RLS mobile já restringe a consulta à
 * própria thread).
 *
 * Mostra o nome de quem escreveu em toda mensagem, dos dois lados -- não
 * só nas respostas da gestão.
 *
 * `citacao`/`aoResponder`/`aoIrParaOriginal`: suporte a responder uma
 * mensagem ou solicitação específica, estilo WhatsApp -- toque longo
 * numa bolha já sincronizada abre um menu suspenso (ver chat.tsx, que
 * decide o que mostrar nele -- hoje só "Responder" -- e resolve
 * `citacao`, que pode ser outra mensagem ou uma solicitação;
 * `BolhaMensagem` não precisa saber qual); tocar na prévia da citação
 * rola até o item original. Mensagens locais (fonte==='local', ainda
 * sem id de servidor) não podem ser citadas nem respondidas, por isso
 * não recebem essas props.
 */
export function BolhaMensagem({
  entrada,
  citacao,
  aoResponder,
  aoIrParaOriginal,
  destacada,
}: {
  entrada: EntradaChat & { tipo: 'mensagem' }
  citacao?: { titulo: string; texto: string; alvoId: string }
  aoResponder?: (r: RespondendoA, evento: GestureResponderEvent) => void
  aoIrParaOriginal?: (alvoId: string) => void
  destacada?: boolean
}) {
  const { perfil } = useAuth()

  if (entrada.fonte === 'servidor') {
    const m = entrada.mensagem
    const minhaPropria = m.autor_id === perfil?.id
    const nomeAutor = minhaPropria ? (perfil?.nome ?? 'Você') : (m.autor?.nome ?? 'Gestão de frotas')
    return (
      <View style={[styles.linha, minhaPropria ? styles.linhaDireita : styles.linhaEsquerda]}>
        <Text style={[styles.autor, minhaPropria ? styles.autorDireita : styles.autorEsquerda]}>
          {nomeAutor}
        </Text>
        <Pressable
          onLongPress={
            aoResponder &&
            ((evento) =>
              aoResponder({ tipo: 'mensagem', id: m.id, titulo: nomeAutor, texto: m.texto }, evento))
          }
          style={[
            styles.bolha,
            minhaPropria ? styles.bolhaPropria : styles.bolhaOutro,
            destacada && styles.bolhaDestacada,
          ]}
        >
          {citacao && (
            <Pressable
              onPress={() => aoIrParaOriginal?.(citacao.alvoId)}
              style={[styles.citacao, minhaPropria ? styles.citacaoPropria : styles.citacaoOutro]}
            >
              <Text style={[styles.citacaoAutor, minhaPropria && styles.citacaoAutorProprio]}>
                {citacao.titulo}
              </Text>
              <Text
                style={[styles.citacaoTexto, minhaPropria && styles.citacaoTextoProprio]}
                numberOfLines={1}
              >
                {citacao.texto}
              </Text>
            </Pressable>
          )}
          <Text style={minhaPropria ? styles.textoProprio : styles.textoOutro}>{m.texto}</Text>
          <Text style={minhaPropria ? styles.horarioProprio : styles.horarioOutro}>
            {hora(entrada.criadoEm)}
          </Text>
        </Pressable>
      </View>
    )
  }

  // fonte === 'local': sempre a própria mensagem do encarregado ainda na
  // fila -- uma resposta da gestão só existe depois de sincronizar e vir
  // do servidor, nunca aparece como item local.
  const item = entrada.item
  return (
    <View style={[styles.linha, styles.linhaDireita]}>
      <Text style={[styles.autor, styles.autorDireita]}>{perfil?.nome ?? 'Você'}</Text>
      <View style={[styles.bolha, styles.bolhaPropria, styles.bolhaLocal]}>
        <Text style={styles.textoProprio}>{item.payload.texto}</Text>
        {item.permanente && item.erroMsg && <Text style={styles.erroMsg}>{item.erroMsg}</Text>}
        <Text style={styles.status}>
          {hora(entrada.criadoEm)} ·{' '}
          {item.status === 'enviando'
            ? 'Enviando…'
            : item.permanente
              ? 'Não foi possível enviar'
              : 'Aguardando envio'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  linha: { marginVertical: 3, marginHorizontal: 12, maxWidth: '86%' },
  linhaDireita: { alignSelf: 'flex-end' },
  linhaEsquerda: { alignSelf: 'flex-start' },
  autor: { fontSize: 11, fontWeight: '700', color: '#0f766e', marginBottom: 2 },
  autorEsquerda: { marginLeft: 4 },
  autorDireita: { marginRight: 4, textAlign: 'right' },
  bolha: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  bolhaOutro: { backgroundColor: '#e2e8f0', borderBottomLeftRadius: 4 },
  bolhaPropria: { backgroundColor: '#0d9488', borderBottomRightRadius: 4 },
  bolhaLocal: { opacity: 0.7 },
  bolhaDestacada: { borderWidth: 2, borderColor: '#0d9488' },
  citacao: {
    borderLeftWidth: 2,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  citacaoOutro: { borderLeftColor: 'rgba(15,23,42,0.35)', backgroundColor: 'rgba(15,23,42,0.06)' },
  citacaoPropria: { borderLeftColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' },
  citacaoAutor: { fontSize: 11, fontWeight: '700', color: '#0f766e' },
  citacaoAutorProprio: { color: '#f0fdfa' },
  citacaoTexto: { fontSize: 11, color: '#475569' },
  citacaoTextoProprio: { color: 'rgba(255,255,255,0.85)' },
  textoOutro: { fontSize: 15, color: '#1e293b' },
  textoProprio: { fontSize: 15, color: '#fff' },
  horarioOutro: { fontSize: 10, color: '#94a3b8', marginTop: 3, textAlign: 'right' },
  horarioProprio: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 3, textAlign: 'right' },
  erroMsg: { fontSize: 12, color: '#fecaca', marginTop: 4 },
  status: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
})
