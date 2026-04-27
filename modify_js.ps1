$path = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js"
$bytes = [System.IO.File]::ReadAllBytes($path)
$hex = [System.BitConverter]::ToString($bytes) -replace '-'

# 1. Byte-level Mojibake Repair (First pass)
$map = @{
    "EFBE83EFBDA7" = "C3A7" # ç
    "EFBE83EFBDA1" = "C3A1" # á
    "EFBE83EFBDAD" = "C3AD" # í
    "EFBE83EFBDB3" = "C3B3" # ó
    "EFBE83EFBDAA" = "C3AA" # ê
    "EFBE83EFBDB5" = "C3B5" # õ
    "EFBE83EFBDA9" = "C3A9" # é
    "EFBE83EFBDA3" = "C3A3" # ã
    "EFBE83EFBDBA" = "C3BA" # ú
    "EFBE83EFBDA2" = "C3A2" # â
}
foreach ($key in $map.Keys) { $hex = $hex -replace $key, $map[$key] }
$newBytes = [byte[]]($hex -split '(?<=\G..)(?=.)' | ForEach-Object { [System.Convert]::ToByte($_, 16) })
$c = [System.Text.Encoding]::UTF8.GetString($newBytes)

# 2. Logic Update: mostrarConfirmacao
$newMC = @"
function mostrarConfirmacao() {
    document.body.classList.add('no-header');
    document.getElementById('agendamentoPage').classList.remove('active');
    document.getElementById('confirmacaoPage').classList.add('active');

    // Atualiza o tÃ­tulo da Agenda no topo do recibo
    const titleEl = document.getElementById('confirmAgendaTitle');
    if (titleEl) titleEl.textContent = (agendamentoData.agendaNome || 'Pedido de Agendamento').toUpperCase();

    // Update confirmation fields
    document.getElementById('confirmCodigo').textContent = agendamentoData.codigo;
    document.getElementById('confirmAgenda').textContent = agendamentoData.agendaNome;
    document.getElementById('confirmData').textContent = limparData(agendamentoData.data);
    document.getElementById('confirmHorario').textContent = limparHorario(agendamentoData.horario);
    document.getElementById('confirmServico').textContent = agendamentoData.servico;
    document.getElementById('confirmNome').textContent = agendamentoData.nome;
    document.getElementById('confirmTelefone').textContent = agendamentoData.telefone;
    document.getElementById('confirmEndereco').textContent = agendamentoData.endereco;

    // Reset visibility of action buttons (Exibe todos para novos agendamentos)
    if (document.getElementById('btnReciboNovo')) document.getElementById('btnReciboNovo').style.display = 'flex';
    if (document.getElementById('btnReciboEditar')) document.getElementById('btnReciboEditar').style.display = 'flex';
    if (document.getElementById('btnReciboCancelar')) document.getElementById('btnReciboCancelar').style.display = 'flex';
    if (document.getElementById('btnReciboImprimir')) document.getElementById('btnReciboImprimir').style.display = 'flex';
}
"@
$c = $c -replace '(?s)function mostrarConfirmacao\(\)\s*\{.*?\}', $newMC

# 3. Logic Update: novoAgendamento (Instant Reset)
$newNA = @"
function novoAgendamento() {
    if (confirm('Deseja iniciar um novo agendamento?')) {
        resetFormularioAgendamento();
    }
}
"@
$c = $c -replace '(?s)function novoAgendamento\(\)\s*\{.*?\}', $newNA

# 4. Logic Update: exibirAgendamentoConsultado (Title + Button Toggle)
$c = $c -replace 'mostrarConfirmacao\(\);', "mostrarConfirmacao();`r`n        const titleEl = document.getElementById('confirmAgendaTitle');`r`n        if (titleEl) titleEl.textContent = (agendamentoData.agendaNome || 'Pedido de Agendamento').toUpperCase();`r`n`r`n        // OCULTAR botÃµes de ediÃ§Ã£o/cancelamento quando vem da consulta por pesquisa`r`n        if (document.getElementById('btnReciboEditar')) document.getElementById('btnReciboEditar').style.display = 'none';`r`n        if (document.getElementById('btnReciboCancelar')) document.getElementById('btnReciboCancelar').style.display = 'none';"

[System.IO.File]::WriteAllText($path, $c, [System.Text.Encoding]::UTF8)
Write-Host "JS modificado com sucesso!"
