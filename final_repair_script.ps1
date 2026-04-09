$inputPath = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script_original.js"
$outputPath = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js"

if (!(Test-Path $inputPath)) { Write-Host "Base file not found: $inputPath"; exit }

Write-Host "Reading raw bytes from $inputPath..."
$bytes = [System.IO.File]::ReadAllBytes($inputPath)
$hex = [System.BitConverter]::ToString($bytes) -replace '-'

# Map of Mojibake Patterns (both 6-byte and potential 4-byte/2-byte variants seen in terminal)
# Pattern A: Primary 6-byte corruption EF-BE-83-EF-BD-XX
$map6 = @{
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
foreach ($key in $map6.Keys) { $hex = $hex -replace $key, $map6[$key] }

# Pattern B: 2-byte terminal corruption like ǭ (C3 AD)
# Actually, if I use GetString(UTF8) later, it should handle standard UTF-8.
# But I'll fix some common ones if they were saved literally as single chars in a previous step.
# (Skipping for now to avoid over-matching, focus on the base bytes).

Write-Host "Converting back to UTF-8 string..."
$newBytes = [byte[]]($hex -split '(?<=\G..)(?=.)' | ForEach-Object { [System.Convert]::ToByte($_, 16) })
$c = [System.Text.Encoding]::UTF8.GetString($newBytes)

# --- RE-APPLYING ALL CUSTOM FEATURES (CLEAN LOGIC) ---

# 1. Update mostrarConfirmacao
$newMC = @"
function mostrarConfirmacao() {
    document.body.classList.add('no-header');
    document.getElementById('agendamentoPage').classList.remove('active');
    document.getElementById('confirmacaoPage').classList.add('active');

    // Atualiza o título da Agenda no topo do recibo
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

# 2. Update novoAgendamento (Instant Reset)
$newNA = @"
function novoAgendamento() {
    if (confirm('Deseja iniciar um novo agendamento?')) {
        resetFormularioAgendamento();
    }
}
"@
$c = $c -replace '(?s)function novoAgendamento\(\)\s*\{.*?\}', $newNA

# 3. Update exibirAgendamentoConsultado (Title + Button Toggle)
$c = $c -replace 'mostrarConfirmacao\(\);', "mostrarConfirmacao();`r`n        const titleEl = document.getElementById('confirmAgendaTitle');`r`n        if (titleEl) titleEl.textContent = (agendamentoData.agendaNome || 'Pedido de Agendamento').toUpperCase();`r`n`r`n        // OCULTAR botões de edição/cancelamento quando vem da consulta por pesquisa`r`n        if (document.getElementById('btnReciboEditar')) document.getElementById('btnReciboEditar').style.display = 'none';`r`n        if (document.getElementById('btnReciboCancelar')) document.getElementById('btnReciboCancelar').style.display = 'none';"

# 4. Final Cleanup: Ensure no leftovers from partial edits (Self-Healing)
# (Fixing some specific strings seen in previous failed runs)
$c = $c.Replace("servi o", "serviço")
$c = $c.Replace("hor rio", "horário")
$c = $c.Replace("não informado", "não informado")

Write-Host "Writing final script.js..."
[System.IO.File]::WriteAllText($outputPath, $c, [System.Text.Encoding]::UTF8)
Write-Host "Final repair and logic injection complete!"
