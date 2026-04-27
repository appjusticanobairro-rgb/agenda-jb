$path = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. saveAgenda
$oldSaveAgenda = '(?s)const suceso = await salvarDadosCloud\(''saveAgenda'', newAgenda\);\s*if \(suceso\) \{\s*if \(editingAgendaId\) \{\s*const idx = agendas\.findIndex\(a => a\.id === editingAgendaId\);\s*agendas\[idx\] = newAgenda;\s*\} else \{\s*agendas\.push\(newAgenda\);\s*\}\s*renderAgendas\(\);\s*closeModal\(\);\s*editingAgendaId = null;\s*showToast\(''Salvo com sucesso!''\);\s*\}'
$newSaveAgenda = @"
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
"@
$content = $content -replace $oldSaveAgenda, $newSaveAgenda

# 2. addServico
$oldAddServico = '(?s)const suceso = await salvarDadosCloud\(''saveServicos'', tempList\);\s*if \(suceso\) \{\s*servicosDisponiveis = tempList;\s*openModal\(''servicos''\); // Refresh\s*\}'
$newAddServico = @"
        servicosDisponiveis = tempList;
        openModal('servicos'); // Refresh
        showToast('Salvando em background...', 'info');
        salvarDadosCloud('saveServicos', tempList);
"@
$content = $content -replace $oldAddServico, $newAddServico

# 3. delServico
$oldDelServico = '(?s)const suceso = await salvarDadosCloud\(''saveServicos'', tempList\);\s*if \(suceso\) \{\s*servicosDisponiveis = tempList;\s*openModal\(''servicos''\);\s*\}'
$newDelServico = @"
        servicosDisponiveis = tempList;
        openModal('servicos');
        showToast('Excluindo em background...', 'info');
        salvarDadosCloud('saveServicos', tempList);
"@
$content = $content -replace $oldDelServico, $newDelServico


# 4. addEndereco
$oldAddEndereco = '(?s)const suceso = await salvarDadosCloud\(''saveEnderecos'', tempList\);\s*if \(suceso\) \{\s*enderecosDisponiveis = tempList;\s*openModal\(''enderecos''\);\s*showToast\(''Endereço cadastrado com sucesso!''\);\s*\}'
$newAddEndereco = @"
    enderecosDisponiveis = tempList;
    openModal('enderecos');
    showToast('Salvando em background...', 'info');
    salvarDadosCloud('saveEnderecos', tempList);
"@
$content = $content -replace $oldAddEndereco, $newAddEndereco

# 5. delEndereco
$oldDelEndereco = '(?s)const suceso = await salvarDadosCloud\(''saveEnderecos'', tempList\);\s*if \(suceso\) \{\s*enderecosDisponiveis = tempList;\s*openModal\(''enderecos''\);\s*\}'
$newDelEndereco = @"
        enderecosDisponiveis = tempList;
        openModal('enderecos');
        showToast('Excluindo em background...', 'info');
        salvarDadosCloud('saveEnderecos', tempList);
"@
$content = $content -replace $oldDelEndereco, $newDelEndereco

# 6. saveUsuario
$oldSaveUsuario = '(?s)const suceso = await salvarDadosCloud\(''saveUsuario'', userData\);\s*if \(suceso\) \{\s*if \(editingUsuarioId\) \{\s*const index = usuarios\.findIndex\(u => u\.id === editingUsuarioId\);\s*if \(index !== -1\) usuarios\[index\] = userData;\s*\} else \{\s*usuarios\.push\(userData\);\s*\}\s*renderUsuarios\(\);\s*closeModal\(\);\s*showToast\(''Usuário salvo com sucesso!''\);\s*\}'
$newSaveUsuario = @"
    if (editingUsuarioId) {
        const index = usuarios.findIndex(u => u.id === editingUsuarioId);
        if (index !== -1) usuarios[index] = userData;
    } else {
        usuarios.push(userData);
    }
    renderUsuarios();
    closeModal();
    showToast('Salvando em background...', 'info');
    salvarDadosCloud('saveUsuario', userData);
"@
$content = $content -replace $oldSaveUsuario, $newSaveUsuario

# 7. excluirUsuario
$oldExcluirUsuario = '(?s)const suceso = await salvarDadosCloud\(''deleteUsuario'', \{ id: userToDelete\.id \}\);\s*if \(suceso\) \{\s*usuarios = usuarios\.filter\(u => u\.id !== id\);\s*renderUsuarios\(\);\s*showToast\(''Usuário removido com sucesso''\);\s*\}'
$newExcluirUsuario = @"
            usuarios = usuarios.filter(u => u.id !== id);
            renderUsuarios();
            showToast('Excluindo em background...', 'info');
            salvarDadosCloud('deleteUsuario', { id: userToDelete.id });
"@
$content = $content -replace $oldExcluirUsuario, $newExcluirUsuario

# 8. excluirAgenda
$oldExcluirAgenda = '(?s)const loading = document\.getElementById\(''loadingOverlay''\).*?showToast\(''Agenda excluída com sucesso da nuvem\.''\);\s*\}'
$newExcluirAgenda = @"
            // Encontrar todos os agendamentos desta agenda antes de remover da variável local
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
"@
$content = $content -replace $oldExcluirAgenda, $newExcluirAgenda

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Script.js updated with optimistic UI logic!"
