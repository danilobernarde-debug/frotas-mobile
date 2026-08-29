import { StyleSheet, Text, View } from 'react-native'

interface PreviaMarcaDaguaProps {
  capturadaEm?: string
  nomeMotorista?: string | null
  placa?: string | null
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

function dataHoraLocal(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Sem fuso explícito de propósito, ao contrário do formatador do
  // servidor (frotas-web/src/lib/marcaDagua.ts, que roda numa função
  // serverless em UTC) -- aqui é o relógio do próprio aparelho, já no
  // fuso local de quem está tirando a foto.
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function montarLinhas(props: PreviaMarcaDaguaProps): string[] {
  const { capturadaEm, nomeMotorista, placa, latitude, longitude, localizacaoRotulo } = props
  const temCoordenadas = latitude != null && longitude != null
  const linhasLocal = temCoordenadas || localizacaoRotulo
    ? [localizacaoRotulo, temCoordenadas ? `${latitude!.toFixed(6)}, ${longitude!.toFixed(6)}` : null].filter(
        (l): l is string => l != null,
      )
    : ['Localização não disponível']

  return [dataHoraLocal(capturadaEm), `Motorista: ${nomeMotorista ?? '—'}`, ...linhasLocal, `Placa: ${placa ?? '—'}`]
}

/**
 * Prévia da marca d'água que o servidor vai gravar de verdade na foto
 * (comMarcaDagua() em frotas-web/src/app/api/mobile/anexos/route.ts) --
 * sobreposta em cima da miniatura já exibida no app, não desenhada na
 * imagem em si (não tem lib de edição de imagem com texto disponível no
 * React Native sem somar uma dependência grande só pra isso). Antes o
 * encarregado só via o resultado real dias depois, pelo painel web --
 * isto deixa claro na hora o que vai ficar gravado. As linhas espelham
 * as do servidor, na mesma ordem; qualquer mudança lá deveria vir aqui
 * também. Localização pode chegar depois da foto já estar na tela (ver
 * capturar() em useCapturaComLocal) -- os campos ficam undefined até lá,
 * a prévia mostra "Localização não disponível" nesse meio tempo e
 * atualiza sozinha quando o GPS responder.
 */
export function PreviaMarcaDagua(props: PreviaMarcaDaguaProps) {
  const linhas = montarLinhas(props)
  return (
    <View style={styles.faixa} pointerEvents="none">
      {linhas.map((linha, i) => (
        <Text key={i} style={styles.linha} numberOfLines={1}>
          {linha}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  faixa: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  linha: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
})
