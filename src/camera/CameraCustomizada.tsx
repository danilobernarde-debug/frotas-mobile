import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type CameraType,
  type FlashMode,
} from 'expo-camera'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native'
import { PreviaMarcaDagua } from './PreviaMarcaDagua'

export interface ContextoMarcaDagua {
  nomeMotorista?: string | null
  placa?: string | null
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

/**
 * O que a câmera devolve. `codigoQr` só vem preenchido quando quem abriu
 * pediu o modo de leitura E um QR realmente apareceu no visor -- null
 * significa "sem QR", nunca "erro".
 */
export interface CapturaComQr {
  uri: string
  codigoQr: string | null
}

interface PedidoAberto {
  marcaDagua?: ContextoMarcaDagua
  /** Liga o leitor de QR no visor e a foto automática. */
  lerQrCode: boolean
  resolver: (resultado: CapturaComQr | null) => void
}

// Registrado pelo host (montado 1x em app/_layout.tsx) -- ver comentário
// em CameraCustomizadaHost sobre o porquê deste sistema ser imperativo.
let abrirRef:
  | ((marcaDagua: ContextoMarcaDagua | undefined, lerQrCode: boolean) => Promise<CapturaComQr | null>)
  | null = null

/**
 * Chamado de fora da árvore React (capturarFoto.ts) -- imperativo de
 * propósito, pra não precisar mudar a assinatura de quem já chama
 * capturarFoto() hoje (useCapturaComLocal, useFormularioSolicitacao,
 * checklists/novo.tsx). Se o host ainda não montou por algum motivo,
 * devolve null (mesmo "cancelou" que capturarFoto() já tratava antes).
 */
export function abrirCameraCustomizada(marcaDagua?: ContextoMarcaDagua): Promise<string | null> {
  if (!abrirRef) return Promise.resolve(null)
  return abrirRef(marcaDagua, false).then((r) => r?.uri ?? null)
}

/**
 * Mesma câmera, com o leitor de QR ligado no visor: assim que um QR Code
 * entra em foco a foto dispara SOZINHA e o conteúdo lido volta junto --
 * ninguém precisa enquadrar e apertar o botão.
 *
 * Existe separada de abrirCameraCustomizada() (em vez de virar mais um
 * parâmetro dela) porque o retorno é outro. Assim as quatro telas que já
 * chamam a câmera comum continuam recebendo `string | null` como sempre,
 * sem precisar tratar um campo que não pediram -- o mesmo motivo do
 * comentário acima sobre não mexer na assinatura de quem já chama.
 *
 * O botão de capturar continua lá: se o recebedor mostrar a chave escrita
 * num papel em vez de QR, é só tirar a foto na mão e `codigoQr` vem null.
 */
export function abrirCameraComQrCode(marcaDagua?: ContextoMarcaDagua): Promise<CapturaComQr | null> {
  if (!abrirRef) return Promise.resolve(null)
  return abrirRef(marcaDagua, true)
}

/**
 * Monta 1x no layout raiz -- o modal em si só aparece quando alguma tela
 * chama abrirCameraCustomizada(). Substitui a antiga
 * ImagePicker.launchCameraAsync() (câmera do sistema operacional) porque
 * só uma câmera dentro do próprio app permite desenhar a marca d'água por
 * cima do visor ao vivo e controlar o flash programaticamente (os dois
 * pedidos do usuário) -- nenhum dos dois é possível sobre a UI da câmera
 * do sistema.
 */
export function CameraCustomizadaHost() {
  const [pedido, setPedido] = useState<PedidoAberto | null>(null)
  // 'off' por padrão sempre que abre -- pedido do usuário (antes a câmera
  // do sistema decidia sozinha, geralmente 'auto').
  const [flash, setFlash] = useState<FlashMode>('off')
  const [facing] = useState<CameraType>('back')
  const [capturando, setCapturando] = useState(false)
  const [qrLido, setQrLido] = useState(false)
  const [permissao, pedirPermissao] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  // Trava de disparo em ref, NÃO em estado: onBarcodeScanned dispara a
  // cada quadro em que o código aparece (várias vezes por segundo) e o
  // React não re-renderiza entre um quadro e outro -- checar `capturando`
  // aqui deixaria passar uma rajada de takePictureAsync antes do primeiro
  // setState chegar. Vale também pro botão de capturar, que passa pelo
  // mesmo caminho.
  const disparando = useRef(false)
  /** Conteúdo do QR lido no visor, guardado até a foto terminar. */
  const codigoQr = useRef<string | null>(null)
  // Evita pedir a permissão de novo a cada re-render enquanto o diálogo
  // ainda não respondeu -- mesmo cuidado já tomado em obterLocalizacaoAtual
  // (src/lib/localizacao.ts) depois de um bug real visto em teste
  // (diálogo do sistema empilhando/travando).
  const pedindoPermissao = useRef(false)

  useEffect(() => {
    abrirRef = (marcaDagua, lerQrCode) =>
      new Promise((resolve) => {
        setFlash('off')
        setQrLido(false)
        disparando.current = false
        codigoQr.current = null
        setPedido({ marcaDagua, lerQrCode, resolver: resolve })
      })
    return () => {
      abrirRef = null
    }
  }, [])

  function fechar(resultado: CapturaComQr | null) {
    setPedido((atual) => {
      atual?.resolver(resultado)
      return null
    })
    pedindoPermissao.current = false
    disparando.current = false
    codigoQr.current = null
    setQrLido(false)
  }

  useEffect(() => {
    if (!pedido || permissao?.granted || pedindoPermissao.current) return
    if (permissao?.canAskAgain === false) {
      fechar(null)
      return
    }
    pedindoPermissao.current = true
    pedirPermissao().then((r) => {
      pedindoPermissao.current = false
      if (!r.granted) fechar(null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, permissao?.granted])

  async function tirarFoto() {
    if (!cameraRef.current || disparando.current) return
    disparando.current = true
    setCapturando(true)
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 1 })
      fechar(foto?.uri ? { uri: foto.uri, codigoQr: codigoQr.current } : null)
    } catch {
      fechar(null)
    } finally {
      setCapturando(false)
    }
  }

  /**
   * Chamado pelo leitor a cada quadro em que reconhece um QR Code. Guarda
   * o conteúdo e dispara a foto -- a leitura em si acontece no fluxo do
   * visor, sem foto nenhuma envolvida; a foto é tirada porque quem paga
   * confere a chave contra ela depois, não porque o leitor precise dela.
   *
   * A vibração é o retorno imediato: takePictureAsync leva alguns décimos
   * de segundo, e sem sinal nenhum o motorista acha que travou e sai
   * balançando o celular justo quando a foto está sendo tirada.
   */
  function aoLerQrCode(leitura: BarcodeScanningResult) {
    if (disparando.current || !leitura.data) return
    codigoQr.current = leitura.data
    setQrLido(true)
    Vibration.vibrate(60)
    tirarFoto()
  }

  if (!pedido) return null

  // Pedido de permissão em si fica no useEffect acima -- aqui só decide o
  // que renderizar enquanto ainda não veio resposta.
  if (!permissao?.granted) {
    return (
      <Modal visible animationType="fade">
        <View style={styles.carregando}>
          <ActivityIndicator color="#0d9488" />
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => fechar(null)}>
      <View style={styles.tela}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          // Leitor ligado só quando alguém pediu -- passar undefined
          // deixa a câmera comum sem o custo de analisar cada quadro.
          barcodeScannerSettings={pedido.lerQrCode ? { barcodeTypes: ['qr'] } : undefined}
          onBarcodeScanned={pedido.lerQrCode ? aoLerQrCode : undefined}
        />

        {pedido.lerQrCode && (
          <View style={styles.qrCamada} pointerEvents="none">
            <View style={[styles.qrMoldura, qrLido && styles.qrMolduraLida]} />
            <Text style={styles.qrInstrucao}>
              {qrLido ? '✓ QR Code lido' : 'Aponte para o QR Code'}
            </Text>
            {!qrLido && (
              <Text style={styles.qrInstrucaoFraca}>
                A foto sai sozinha. Sem QR? Use o botão abaixo.
              </Text>
            )}
          </View>
        )}

        {pedido.marcaDagua && (
          <View style={styles.marcaDaguaPosicao} pointerEvents="none">
            <PreviaMarcaDagua
              capturadaEm={new Date().toISOString()}
              nomeMotorista={pedido.marcaDagua.nomeMotorista}
              placa={pedido.marcaDagua.placa}
              latitude={pedido.marcaDagua.latitude}
              longitude={pedido.marcaDagua.longitude}
              localizacaoRotulo={pedido.marcaDagua.localizacaoRotulo}
            />
          </View>
        )}

        <View style={styles.topo}>
          <Pressable onPress={() => fechar(null)} style={styles.botaoTopo} hitSlop={10}>
            <Text style={styles.botaoTopoTexto}>✕ Fechar</Text>
          </Pressable>
          <Pressable
            onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
            style={styles.botaoTopo}
            hitSlop={10}
          >
            <Text style={styles.botaoTopoTexto}>{flash === 'off' ? '⚡️ Flash desligado' : '⚡️ Flash ligado'}</Text>
          </Pressable>
        </View>

        <View style={styles.rodape}>
          <Pressable onPress={tirarFoto} disabled={capturando} style={styles.botaoCapturar}>
            {capturando && <ActivityIndicator color="#0f172a" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  tela: { flex: 1, backgroundColor: '#000' },
  // 96 (altura aproximada do rodape) + folga -- fica acima do botão de
  // capturar em vez de disputar o mesmo espaço (PreviaMarcaDagua já se
  // posiciona sozinha em bottom:0 dentro deste container).
  marcaDaguaPosicao: { position: 'absolute', left: 0, right: 0, bottom: 110 },
  topo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // Fixo (não SafeAreaView) de propósito: dentro de um <Modal>, o
    // react-native-safe-area-context às vezes não calcula o inset direito
    // (janela nativa separada) -- achado real: botão "Fechar" ficava fora
    // da área visível, sem jeito de fechar a câmera. Valor generoso cobre
    // notch/Dynamic Island/status bar sem depender desse cálculo.
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
  },
  botaoTopo: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botaoTopoTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Mira do modo de leitura: fica no centro e NÃO recebe toque
  // (pointerEvents="none" no container) pra não roubar o botão de
  // capturar nem o "Fechar" que ficam por cima do mesmo visor.
  qrCamada: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrMoldura: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  qrMolduraLida: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)' },
  qrInstrucao: {
    marginTop: 20,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  qrInstrucaoFraca: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  rodape: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    // Mesmo motivo do paddingTop acima -- cobre a faixa do indicador de
    // início (home indicator) no iPhone sem SafeAreaView.
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  botaoCapturar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
