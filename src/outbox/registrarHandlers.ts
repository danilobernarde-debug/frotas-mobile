// Efeito colateral: cada import chama registrarHandler() no módulo do
// handler. Importe este arquivo uma vez, no layout raiz, antes de
// qualquer chamada a runSync().
import './handlers/checklist'
import './handlers/mensagem'
import './handlers/novaSolicitacao'
