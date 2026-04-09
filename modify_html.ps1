$path = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\index.html"
$c = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. Inserir o novo Cabeçalho
$oldHeader = '<div id="confirmacaoPage" class="public-page">'
$newHeader = @"
        <div id="confirmacaoPage" class="public-page">
            <header class="public-header-recibo">
                <div class="header-logo">
                    <img src="logo_jb.png" alt="Justiça no Bairro">
                </div>
                <div class="recibo-actions">
                    <button id="btnReciboNovo" class="btn-recibo-blue" onclick="novoAgendamento()">
                        <i class="fas fa-plus"></i> Novo Agendamento
                    </button>
                    <button id="btnReciboEditar" class="btn-recibo-outline" onclick="editarAgendamento()">
                        <i class="fas fa-edit"></i> Editar Agendamento
                    </button>
                    <button id="btnReciboCancelar" class="btn-recibo-cancel" onclick="cancelarAgendamento()">
                        <i class="fas fa-times-circle"></i> Cancelar Agendamento
                    </button>
                    <button id="btnReciboImprimir" class="btn-recibo-print" onclick="imprimirRecibo()">
                        <i class="fas fa-print"></i> Imprimir Recibo
                    </button>
                </div>
            </header>
"@
$c = $c.Replace($oldHeader, $newHeader)

# 2. Inserir o Title Card dentro da recibo-wrapper
$oldWrapper = '<div class="recibo-wrapper">'
$newWrapper = @"
            <div class="recibo-wrapper">
                <div class="agenda-title-card">
                    <h1 id="confirmAgendaTitle">PEDIDO DE AGENDAMENTO</h1>
                    <p>Sistema de Agendamento Online</p>
                </div>
"@
$c = $c.Replace($oldWrapper, $newWrapper)

# 3. Remover os botões antigos que ficaram duplicados (agora estão no header)
# Localizamos o bloco de recibo-actions que sobrou e removemos
$regex = '(?s)<div class="recibo-actions">.*?</div>'
$c = $c -replace $regex, ""

[System.IO.File]::WriteAllText($path, $c, [System.Text.Encoding]::UTF8)
Write-Host "HTML modificado com sucesso!"
