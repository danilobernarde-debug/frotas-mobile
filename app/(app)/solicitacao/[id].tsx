import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { data as fmtData, moeda } from '../../../src/lib/formato'
import { urlAnexo } from '../../../src/lib/api'
import { supabase } from '../../../src/lib/supabase'
import type { AnexoAprovacao, Aprovacao } from '../../../src/lib/tipos'

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado ✅',
  REPROVADO: 'Reprovado ❌',
}

const ROTULO_FOTO: Record<string, string> = {
  BOMBA: 'Bomba de combustível',
  PLACA: 'Placa do veículo',
  KM: 'KM do veículo',
  PROBLEMA: 'Foto do problema',
  OUTRO: 'Foto',
}

/** <Image source={{ uri, headers }}> não manda o header Authorization de
 *  forma confiável (achado em teste real: um fetch() com o mesmo token
 *  pra mesma URL funciona -- 200, image/jpeg -- mas o Image nunca
 *  carrega). Baixa os bytes na mão e converte pra data URI, que o Image
 *  exibe sem precisar de nenhum header. */
async function baixarComoDataUri(url: string, token: string): Promise<string> {
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resposta.ok) throw new Error(`Falha ao buscar foto (status ${resposta.status}).`)
  const blob = await resposta.blob()
  return await new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result as string)
    leitor.onerror = () => reject(new Error('Falha ao ler a foto.'))
    leitor.readAsDataURL(blob)
  })
}

export default function TelaDetalheSolicitacao() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null)
  const [anexos, setAnexos] = useState<AnexoAprovacao[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [fotosDataUri, setFotosDataUri] = useState<Record<number, string>>({})
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const [{ data: sessao }, respostaAprovacao, respostaAnexos] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('frota_aprovacoes')
          .select('*, veiculo:frota_veiculos(id, placa, modelo)')
          .eq('id', Number(id))
          .maybeSingle(),
        supabase.from('frota_aprovacao_anexos').select('*').eq('aprovacao_id', Number(id)).order('id'),
      ])
      if (cancelado) return
      setToken(sessao.session?.access_token ?? null)
      setAprovacao((respostaAprovacao.data as Aprovacao) ?? null)
      setAnexos((respostaAnexos.data as AnexoAprovacao[]) ?? [])
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [id])

  // Roda só depois que anexos/token já chegaram -- busca cada foto por
  // fora do Image (ver baixarComoDataUri) e guarda o resultado por id,
  // pra cada uma aparecer assim que estiver pronta em vez de esperar
  // todas juntas.
  useEffect(() => {
    if (anexos.length === 0 || !token) return
    let cancelado = false
    for (const a of anexos) {
      baixarComoDataUri(urlAnexo('aprovacoes', a.id), token)
        .then((dataUri) => {
          if (!cancelado) setFotosDataUri((atual) => ({ ...atual, [a.id]: dataUri }))
        })
        .catch(() => {
          // best-effort -- essa foto fica com o placeholder cinza, resto segue normal
        })
    }
    return () => {
      cancelado = true
    }
  }, [anexos, token])

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      {/* Cabeçalho próprio (não o nativo do Stack) -- mesma razão das
          outras telas desde a Fase H: o nativo não respeita a área
          segura no Android em modo edge-to-edge, o que deixava o botão
          de voltar sobreposto pela barra de status e, na prática,
          difícil de tocar direito (achado em teste real). */}
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Text style={styles.iconeVoltar}>←</Text>
        </Pressable>
        <Text style={styles.tituloCabecalho}>Solicitação</Text>
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator />
        </View>
      ) : !aprovacao ? (
        <View style={styles.centro}>
          <Text style={styles.textoVazio}>Solicitação não encontrada.</Text>
        </View>
      ) : (
        <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}>
          <Text style={styles.status}>{ROTULO_STATUS[aprovacao.status]}</Text>
          <Text style={styles.servico}>{aprovacao.servico}</Text>

          <View style={styles.linha}>
            <Text style={styles.rotulo}>Veículo</Text>
            <Text style={styles.valor}>{aprovacao.veiculo?.placa ?? '—'}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.rotulo}>Data</Text>
            <Text style={styles.valor}>{fmtData(aprovacao.data)}</Text>
          </View>
          {aprovacao.odometro != null && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>KM</Text>
              <Text style={styles.valor}>{aprovacao.odometro.toLocaleString('pt-BR')}</Text>
            </View>
          )}
          {aprovacao.valor > 0 && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>Valor</Text>
              <Text style={styles.valor}>{moeda(aprovacao.valor)}</Text>
            </View>
          )}

          {anexos.length > 0 && (
            <>
              <Text style={styles.tituloFotos}>Fotos</Text>
              <View style={styles.grade}>
                {anexos.map((a) => (
                  <View key={a.id} style={styles.fotoCartao}>
                    {fotosDataUri[a.id] ? (
                      // A miniatura corta em quadrado (cover) -- numa foto
                      // retrato, a marca d'água (BOMBA/PLACA/KM) fica no
                      // rodapé da imagem inteira e quase some no corte
                      // (achado em teste real). Toque abre a foto completa,
                      // sem cortar nada.
                      <Pressable onPress={() => setFotoAmpliada(a.id)}>
                        <Image source={{ uri: fotosDataUri[a.id] }} style={styles.foto} resizeMode="cover" />
                      </Pressable>
                    ) : (
                      <View style={[styles.foto, styles.fotoCarregando]}>
                        <ActivityIndicator size="small" />
                      </View>
                    )}
                    <Text style={styles.fotoLegenda}>{ROTULO_FOTO[a.tipo] ?? a.tipo}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Modal
        visible={fotoAmpliada !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <Pressable style={styles.fundoModal} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada !== null && fotosDataUri[fotoAmpliada] && (
            <Image
              source={{ uri: fotosDataUri[fotoAmpliada] }}
              style={styles.fotoAmpliada}
              resizeMode="contain"
            />
          )}
        </Pressable>
        <SafeAreaView style={styles.areaSeguraModal} edges={['top']} pointerEvents="box-none">
          <Pressable style={styles.botaoFecharModal} onPress={() => setFotoAmpliada(null)} hitSlop={12}>
            <Text style={styles.botaoFecharModalTexto}>✕</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  botaoVoltar: { padding: 6 },
  iconeVoltar: { fontSize: 22, color: '#0f172a', fontWeight: '600' },
  tituloCabecalho: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  conteudo: { padding: 16 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textoVazio: { color: '#94a3b8' },
  status: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 4 },
  servico: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rotulo: { fontSize: 13, color: '#64748b' },
  valor: { fontSize: 14, color: '#1e293b', fontWeight: '600' },
  tituloFotos: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 20, marginBottom: 8 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoCartao: { width: '47%' },
  foto: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#e2e8f0' },
  fotoCarregando: { alignItems: 'center', justifyContent: 'center' },
  fotoLegenda: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fotoAmpliada: { width: '100%', height: '85%' },
  areaSeguraModal: { position: 'absolute', top: 0, left: 0, right: 0 },
  botaoFecharModal: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoFecharModalTexto: { color: '#fff', fontSize: 20, fontWeight: '700' },
})
