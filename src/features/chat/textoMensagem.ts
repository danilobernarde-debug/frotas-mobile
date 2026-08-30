import type { Mensagem } from '../../lib/tipos'

/** Rótulo mostrado quando a mensagem é só anexo (sem legenda) -- citação,
 *  "respondendo a" e resolverCitacao sempre precisam de algum texto pra
 *  mostrar, mesmo sem legenda nenhuma. Mesmos rótulos usados na bolha em
 *  si (BolhaMensagem.tsx) e espelham thread.tsx do painel web. */
const ROTULO_ANEXO: Record<NonNullable<Mensagem['anexo_tipo']>, string> = {
  IMAGEM: '📷 Foto',
  AUDIO: '🎤 Áudio',
  DOCUMENTO: '📄 Documento',
  VIDEO: '🎬 Vídeo',
  LOCALIZACAO: '📍 Localização',
}

export function previaMensagem(m: Mensagem): string {
  return m.texto ?? (m.anexo_tipo ? ROTULO_ANEXO[m.anexo_tipo] : '')
}
