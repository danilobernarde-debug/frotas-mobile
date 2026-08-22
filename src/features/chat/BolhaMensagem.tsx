import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/useAuth'
import type { EntradaChat } from './types'

/**
 * Alinha a mensagem à direita se foi o próprio encarregado que escreveu,
 * à esquerda se é resposta da gestão -- comparando autor_id com o
 * perfil logado (seguro porque o RLS mobile já restringe a consulta à
 * própria thread). Reaproveita o visual de bolha cinza à esquerda que
 * ConteudoFluxo.tsx já usa pras perguntas do roteiro, em vez de inventar
 * um estilo novo pra "resposta recebida".
 *
 * Mostra o nome de quem escreveu em toda mensagem, dos dois lados -- não
 * só nas respostas da gestão.
 */
export function BolhaMensagem({ entrada }: { entrada: EntradaChat & { tipo: 'mensagem' } }) {
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
        <View style={[styles.bolha, minhaPropria ? styles.bolhaPropria : styles.bolhaOutro]}>
          <Text style={minhaPropria ? styles.textoProprio : styles.textoOutro}>{m.texto}</Text>
        </View>
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
  textoOutro: { fontSize: 15, color: '#1e293b' },
  textoProprio: { fontSize: 15, color: '#fff' },
  erroMsg: { fontSize: 12, color: '#fecaca', marginTop: 4 },
  status: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
})
