$path = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Normalize CRLF to LF
$c = $content -replace "`r`n", "`n"

# 1. addServico
$old1 = @"
        const suceso = await salvarDadosCloud('saveServicos', tempList);
        if (suceso) {
            servicosDisponiveis = tempList;
            openModal('servicos'); // Refresh
        }
"@ -replace "`r`n", "`n"
$new1 = @"
        servicosDisponiveis = tempList;
        openModal('servicos'); // Refresh
        showToast('Salvando em background...', 'info');
        salvarDadosCloud('saveServicos', tempList);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old1, $new1)

# 2. delServico
$old2 = @"
        const suceso = await salvarDadosCloud('saveServicos', tempList);
        if (suceso) {
            servicosDisponiveis = tempList;
            openModal('servicos');
        }
"@ -replace "`r`n", "`n"
$new2 = @"
        servicosDisponiveis = tempList;
        openModal('servicos');
        showToast('Excluindo em background...', 'info');
        salvarDadosCloud('saveServicos', tempList);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old2, $new2)

# 3. addEndereco
$old3 = @"
    const suceso = await salvarDadosCloud('saveEnderecos', tempList);
    if (suceso) {
        enderecosDisponiveis = tempList;
        openModal('enderecos');
        showToast('Endereço cadastrado com sucesso!');
    }
"@ -replace "`r`n", "`n"
$new3 = @"
    enderecosDisponiveis = tempList;
    openModal('enderecos');
    showToast('Salvando em background...', 'info');
    salvarDadosCloud('saveEnderecos', tempList);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old3, $new3)

# 4. delEndereco
$old4 = @"
        const suceso = await salvarDadosCloud('saveEnderecos', tempList);
        if (suceso) {
            enderecosDisponiveis = tempList;
            openModal('enderecos');
        }
"@ -replace "`r`n", "`n"
$new4 = @"
        enderecosDisponiveis = tempList;
        openModal('enderecos');
        showToast('Excluindo em background...', 'info');
        salvarDadosCloud('saveEnderecos', tempList);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old4, $new4)

# 5. saveAgenda
$old5 = @"
    const suceso = await salvarDadosCloud('saveAgenda', newAgenda);
    if (suceso) {
        if (editingAgendaId) {
            const idx = agendas.findIndex(a => a.id === editingAgendaId);
            agendas[idx] = newAgenda;
        } else {
            agendas.push(newAgenda);
        }
        renderAgendas();
        closeModal();
        editingAgendaId = null;
        showToast('Salvo com sucesso!');
    }
"@ -replace "`r`n", "`n"
$new5 = @"
    if (editingAgendaId) {
        const idx = agendas.findIndex(a => a.id === editingAgendaId);
        agendas[idx] = newAgenda;
    } else {
        agendas.push(newAgenda);
    }
    renderAgendas();
    closeModal();
    editingAgendaId = null;
    showToast('Salvando em background...', 'info');
    salvarDadosCloud('saveAgenda', newAgenda);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old5, $new5)

# 6. excluirUsuario
$old6 = @"
            const suceso = await salvarDadosCloud('deleteUsuario', { id: userToDelete.id });
            if (suceso) {
                usuarios = usuarios.filter(u => u.id !== id);
                renderUsuarios();
                showToast('Usuário removido com sucesso');
            }
"@ -replace "`r`n", "`n"
$new6 = @"
            usuarios = usuarios.filter(u => u.id !== id);
            renderUsuarios();
            showToast('Excluindo em background...', 'info');
            salvarDadosCloud('deleteUsuario', { id: userToDelete.id });
"@ -replace "`r`n", "`n"
$c = $c.Replace($old6, $new6)

# 7. saveUsuario
$old7 = @"
    const suceso = await salvarDadosCloud('saveUsuario', userData);
    if (suceso) {
        if (editingUsuarioId) {
            const index = usuarios.findIndex(u => u.id === editingUsuarioId);
            if (index !== -1) usuarios[index] = userData;
        } else {
            usuarios.push(newUser = userData);
        }
        renderUsuarios();
        closeModal();
        editingUsuarioId = null;
        showToast('Usuário salvo com sucesso!');
    }
"@ -replace "`r`n", "`n"
$new7 = @"
    if (editingUsuarioId) {
        const index = usuarios.findIndex(u => u.id === editingUsuarioId);
        if (index !== -1) usuarios[index] = userData;
    } else {
        usuarios.push(newUser = userData);
    }
    renderUsuarios();
    closeModal();
    editingUsuarioId = null;
    showToast('Salvando em background...', 'info');
    salvarDadosCloud('saveUsuario', userData);
"@ -replace "`r`n", "`n"
$c = $c.Replace($old7, $new7)

# 8. excluirAgenda
$old8 = @"
            const loading = document.getElementById('loadingOverlay');
            if (loading) {
                loading.querySelector('p').textContent = 'Excluindo agenda e agendamentos... isso pode levar alguns segundos.';
                loading.style.display = 'flex';
            }

            // Encontrar todos os agendamentos desta agenda
            const agendamentosVinculados = agendamentos.filter(ag => ag.agendaId == id);

            // Excluir cada agendamento sequencialmente para evitar falhas de concorrência na nuvem
            for (let ag of agendamentosVinculados) {
                await salvarDadosCloud('deleteAgendamento', { codigo: ag.codigo });
            }

            // Excluir a agenda
            const suceso = await salvarDadosCloud('deleteAgenda', { id: agendaToDelete.id });

            if (loading) {
                loading.style.display = 'none';
                loading.querySelector('p').textContent = 'Sincronizando dados...'; // reset default text
            }

            if (suceso) {
                agendas = agendas.filter(a => a.id !== id);
                agendamentos = agendamentos.filter(ag => ag.agendaId != id); // Clear locally

                // Evita que o cache carregue dados mortos na próxima piscada
                localStorage.removeItem('appDataCache');
                localStorage.removeItem('appDataCacheTime');

                renderAgendas();
                showToast('Agenda e ' + agendamentosVinculados.length + ' agendamentos removidos com sucesso');
            }
"@ -replace "`r`n", "`n"
$new8 = @"
            // Encontrar todos os agendamentos desta agenda antes de remover da variavel local
            const agendamentosVinculados = agendamentos.filter(ag => ag.agendaId == id);

            // Optimistic update
            agendas = agendas.filter(a => a.id !== id);
            agendamentos = agendamentos.filter(ag => ag.agendaId != id); // Clear locally

            localStorage.removeItem('appDataCache');
            localStorage.removeItem('appDataCacheTime');

            renderAgendas();
            showToast('Excluindo agenda e seus agendamentos em background...', 'info');

            // Float the cloud operations in background
            (async () => {
                for (let ag of agendamentosVinculados) {
                    await salvarDadosCloud('deleteAgendamento', { codigo: ag.codigo });
                }
                await salvarDadosCloud('deleteAgenda', { id: agendaToDelete.id });
            })();
"@ -replace "`r`n", "`n"
$c = $c.Replace($old8, $new8)

# Convert \n back to CRLF natively so git diff isn't overwhelmed
$c = $c -replace "`n", "`r`n"
# Handle edge case where it ends up \r\r\n
$c = $c -replace "`r`r`n", "`r`n"

[System.IO.File]::WriteAllText($path, $c, [System.Text.Encoding]::UTF8)
Write-Host "Normalized literal replacements successfully applied!"
