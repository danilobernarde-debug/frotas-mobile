import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
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

export default function TelaDetalheSolicitacao() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null)
  const [anexos, setAnexos] = useState<AnexoAprovacao[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

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

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!aprovacao) {
    return (
      <View style={styles.centro}>
        <Text style={styles.textoVazio}>Solicitação não encontrada.</Text>
      </View>
    )
  }

  return (
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
      {aprovacao.valor > 0 && (
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Valor</Text>
          <Text style={styles.valor}>{moeda(aprovacao.valor)}</Text>
        </View>
      )}

      {anexos.length > 0 && token && (
        <>
          <Text style={styles.tituloFotos}>Fotos</Text>
          <View style={styles.grade}>
            {anexos.map((a) => (
              <View key={a.id} style={styles.fotoCartao}>
                <Image
                  source={{
                    uri: urlAnexo('aprovacoes', a.id),
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={styles.foto}
                  resizeMode="cover"
                />
                <Text style={styles.fotoLegenda}>{ROTULO_FOTO[a.tipo] ?? a.tipo}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
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
  fotoLegenda: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' },
})
