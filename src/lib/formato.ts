/** '2026-08-12' -> '12/08/2026'. Monta a data manualmente pra não cair no
 *  fuso do navegador e mostrar o dia anterior (mesma lógica do frotas-web). */
export function data(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  return `${dia}/${mes}/${ano}`
}

export function moeda(valor: number | null | undefined): string {
  return Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** '2026-08-13T10:00:00Z' -> '07:00' (fuso local, só a hora). */
export function hora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** '2026-08-13T10:00:00Z' -> 'Hoje' / 'Ontem' / '21 de agosto de 2026' --
 *  separador de dia pro chat, onde cada bolha já mostra só o horário
 *  (hora()) e precisa de algo que diga qual dia. */
export function diaRelativo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mesmoDia(d, hoje)) return 'Hoje'
  if (mesmoDia(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** 2_400_000 -> '2,3 MB' -- anexo de mensagem (chat), tamanho do arquivo
 *  no cartão de documento. Espelha frotas-web/src/lib/formato.ts. */
export function tamanhoArquivo(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 65 -> '1:05' -- tempo de gravação/reprodução de áudio. */
export function duracaoAudio(segundos: number | null | undefined): string {
  if (segundos == null || Number.isNaN(segundos)) return '0:00'
  const m = Math.floor(segundos / 60)
  const s = Math.floor(segundos % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
