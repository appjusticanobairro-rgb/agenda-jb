const API_URL = 'https://script.google.com/macros/s/AKfycbzCecQK6mQfT5VITQMiyGU3qJkhWjr-8wdItrLJhyI_eUW9xRxwpdBhDWAlOK3ib26Jrg/exec';

// Data Store
let agendas = [];
let servicosDisponiveis = [];
let enderecosDisponiveis = [];
let agendamentos = [];
let usuarios = [];
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

// Defaults para migração
const USUARIOS_DEFAULT = [
    {
        id: 1,
        nome: 'Edson',
        login: 'edson.justicanobairro',
        senha: 'admin',
        perfil: 'Administrador',
        status: 'Ativo'
    }
];

// Defaults para migração
const defaultServices = [
    { nome: "01 - Alimentos (pensão alimentícia)", duracao: 60 },
    { nome: "23 - RG", duracao: 15 },
    { nome: "20 - Coleta de Exame de DNA", duracao: 30 }
];

let editingAgendaId = null;
let editingUsuarioId = null; // State for user editing
let currentStep = 1;
let agendamentoData = {};
let currentPublicAgenda = null; // Agenda ativa no momento (público)

// Carregar dados da Nuvem (Google Sheets)
async function carregarDados(isBackground = false) {
    const loader = document.getElementById('loadingOverlay');
    const cachedStr = localStorage.getItem('appDataCache');
    const cacheTime = localStorage.getItem('appDataCacheTime');
    const now = Date.now();
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

    const cacheValido = cachedStr && cacheTime && (now - parseInt(cacheTime) < CACHE_DURATION);
    const isPublicPage = window.location.hash && window.location.hash.length > 2;
    
    // Só mostra o loader se NÃO estiver em background, NÃO tiver cache válido, e NÃO for página pública
    if (!isBackground && !cacheValido && !isPublicPage && loader) {
        loader.style.display = 'flex';
    }
    
    if (!isBackground) console.log("Solicitando dados da nuvem...");
    try {
        if (!isBackground && cacheValido) {
            console.log("Usando cache local para carregamento rápido.");
            try {
                const data = JSON.parse(cachedStr);
                processarDadosApp(data);
                carregarDados(true); // Atualiza em background sem incomodar
                return true;
            } catch (e) {
                console.error("Erro ao ler cache", e);
            }
        }

        if (!isBackground) console.log("Sem cache válido. Buscando na nuvem...");
        const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`);
        const data = await response.json();

        // Save to cache
        localStorage.setItem('appDataCache', JSON.stringify(data));
        localStorage.setItem('appDataCacheTime', Date.now().toString());

        processarDadosApp(data);

        // Auto-seed: Se a planilha está vazia, popular com dados iniciais
        if (!isBackground) {
            if (usuarios.length === 0) {
                console.log("Nenhum usuário na nuvem. Criando admin padrão...");
                for (const u of USUARIOS_DEFAULT) {
                    await salvarDadosCloud('saveUsuario', u);
                }
                usuarios = [...USUARIOS_DEFAULT];
            }
            if (!data.servicos || data.servicos.length === 0) {
                console.log("Sem serviços na nuvem. Enviando defaults...");
                await salvarDadosCloud('saveServicos', defaultServices);
            }
            if (!data.enderecos || data.enderecos.length === 0) {
                console.log("Sem endereços na nuvem. Enviando default...");
                await salvarDadosCloud('saveEnderecos', enderecosDisponiveis);
            }
        } else {
            // Se estiver em background e no Admin, renderizar para mostrar possíveis novos dados silenciosamente
            const adminPage = document.getElementById('adminPage');
            if (adminPage && adminPage.style.display !== 'none' && typeof renderAgendas === 'function') {
                renderAgendas();
            }
        }

        // Sessão do usuário local
        usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
        if (!isBackground && loader) loader.style.display = 'none';
        return true;

    } catch (error) {
        console.error("Erro ao carregar dados da nuvem:", error);
        if (loader) loader.style.display = 'none';
        if (!isBackground) showToast("Erro ao conectar com o banco de dados. Verifique sua conexão.", "error");
        return false;
    }
}

function processarDadosApp(data) {
    agendas = (data.agendas || []).map(a => ({
        ...a,
        dataInicial: limparDataISO(a.dataInicial),
        ultimaData: limparDataISO(a.ultimaData),
        atendimentoInicial: limparDataISO(a.atendimentoInicial),
        atendimentoFinal: limparDataISO(a.atendimentoFinal)
    }));
    agendamentos = (data.agendamentos || []).map(a => ({
        ...a,
        data: limparDataISO(a.data),
        horario: limparHoraISO(a.horario)
    }));
    usuarios = data.usuarios || [];

    // Servicos e Endereços: usar defaults se vazios
    servicosDisponiveis = (data.servicos && data.servicos.length > 0) ? data.servicos : defaultServices;
    enderecosDisponiveis = (data.enderecos && data.enderecos.length > 0) ? data.enderecos : ["Av. Pres. Kennedy, n.º 900, Bairro Centro, Telêmaco Borba"];

    console.log("Dados processados com sucesso.");
}

// Salvar dados na Nuvem (Google Sheets via Apps Script)
async function salvarDadosCloud(action, data) {
    try {
        console.log(`Enviando ação '${action}' para a nuvem...`);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, data }),
            redirect: 'follow'
        });
        const result = await response.json();
        console.log("Resposta da nuvem:", result);

        if (result.status === 'success') {
            // Invalidar o cache após uma alteração bem-sucedida para forçar o download na próxima recarga
            localStorage.removeItem('appDataCache');
            localStorage.removeItem('appDataCacheTime');
            showToast('Dados sincronizados!', 'success');
            return true;
        } else {
            const erroMsg = result.error || 'Falha no processamento';
            showToast(`Erro na nuvem: ${erroMsg}`, 'error');
            return false;
        }
    } catch (error) {
        console.error("Erro ao salvar dados na nuvem:", error);
        showToast("Erro de conexão. Verifique sua rede.", "error");
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const hash = window.location.hash;
    
    // Se NÃO for rota pública (sem hash), podemos mostrar o login/admin logo (usando cache se existir)
    if (!hash || hash === "" || hash === "#" || hash === "#/") {
        verificarRota();
    }

    // Carregar dados da nuvem
    await carregarDados();

    // Sincronizar sessão e verificar rota final (importante para slugs que dependem de dados)
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
    verificarRota();

    // Listener para o Enter na tela de login
    const loginFields = ['loginUser', 'loginPass'];
    loginFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) {
            field.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    realizarLogin();
                }
            });
        }
    });
});

// Sincronização via hashchange (navegação entre páginas)
window.addEventListener('hashchange', () => verificarRota());

// --- ROTEAMENTO ---
function verificarRota() {
    console.log("--- verificarRota ---");
    const hash = window.location.hash;
    const adminPage = document.getElementById('adminPage');
    const loginSection = document.getElementById('loginSection');
    const appContainer = document.getElementById('appContainer');

    console.log("Hash:", hash);

    // 1. ISOLAMENTO TOTAL: Se houver um slug no hash, tratamos como rota pública
    if (hash && hash.length > 1) {
        let slugRaw = hash.startsWith('#/') ? hash.substring(2) : hash.substring(1);
        const slug = decodeURIComponent(slugRaw).trim().toLowerCase();

        // Ignorar se o hash for apenas "/" ou caminhos vazios que não são slugs
        if (slug && slug !== "" && slug !== "/" && slug !== "index.html") {
            console.log("Rota de slug detectada:", slug);

            // Busca insensível a maiúsculas/minúsculas
            const agendaFound = agendas.find(a => a.slug.toLowerCase() === slug);

            if (agendaFound) {
                console.log("Agenda encontrada:", agendaFound.nome);

                // ESCONDE administrativo e login de forma agressiva
                document.body.classList.add('no-header');
                document.body.classList.remove('login-active');
                if (loginSection) loginSection.style.display = 'none';
                if (adminPage) adminPage.style.display = 'none';
                if (appContainer) appContainer.style.display = '';

                const hojeObj = new Date();
                const hoje = hojeObj.getFullYear() + '-' + String(hojeObj.getMonth() + 1).padStart(2, '0') + '-' + String(hojeObj.getDate()).padStart(2, '0');

                const ini = (agendaFound.dataInicial || '').split('T')[0];
                const fim = (agendaFound.ultimaData || '').split('T')[0];

                const foraDaVigencia = (ini && hoje < ini) || (fim && hoje > fim);

                if (agendaFound.status === 'active' && !foraDaVigencia) {
                    mostrarPaginaAgendamento(agendaFound);
                } else {
                    mostrarPaginaDesativada();
                }
                return; // Encerra aqui. NUNCA chegará no redirecionamento de login.
            } else {
                console.warn(`Slug '${slug}' não encontrado localmente.`);

                // Se o slug foi digitado mas a agenda não existe neste navegador/dispositivo
                // mostramos a página de erro pública, SEM redirecionar para login.
                mostrarPaginaDesativada("Agenda não encontrada", "Esta agenda não existe neste dispositivo ou navegador. Verifique se o link está correto ou se os dados foram criados em outro computador.");
                return; // Encerra aqui.
            }
        }
    }

    // 2. Fluxo Administrativo (apenas se NÃO houver slug no link)
    if (!usuarioLogado) {
        console.log("Nenhum slug detectado e usuário não logado. Mostrando login.");
        showLogin();
        return;
    }

    // Usuário Logado - Área Admin
    console.log("Acessando área administrativa.");
    mostrarAdmin();
}

function showLogin() {
    document.body.classList.add('login-active');
    document.body.classList.add('no-header');
    const adminPage = document.getElementById('adminPage');
    const loginSection = document.getElementById('loginSection');
    const appContainer = document.getElementById('appContainer');

    if (appContainer) appContainer.style.display = 'none';
    if (adminPage) adminPage.style.display = 'none';
    if (loginSection) {
        loginSection.style.display = 'flex';
    }
}

function togglePasswordLogin() {
    const passInput = document.getElementById('loginPass');
    const eyeIcon = document.getElementById('eyeIcon');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
}

function realizarLogin() {
    console.log("Tentando realizar login...");
    const userInput = document.getElementById('loginUser');
    const passInput = document.getElementById('loginPass');

    if (!userInput || !passInput) {
        console.error("Campos de login não encontrados no DOM");
        return;
    }

    const user = userInput.value.trim().toLowerCase();
    const pass = passInput.value.trim();

    console.log(`Usuário digitado: ${user}`);

    if (!user || !pass) {
        return showToast('Preencha usuário e senha', 'error');
    }

    const userFound = usuarios.find(u => String(u.login || '').toLowerCase().trim() === user);

    if (userFound) {
        // Garantir comparação como string (evita falha se a senha na planilha for um número)
        if (String(userFound.senha) === String(pass)) {
            console.log("Usuário encontrado! Perfil:", userFound.perfil);
            if (userFound.status !== 'Ativo') {
                return showToast('Usuário inativo', 'error');
            }
            usuarioLogado = userFound;
            localStorage.setItem('usuarioLogado', JSON.stringify(userFound));
            showToast(`Bem-vindo, ${userFound.nome}!`);
            verificarRota();
        } else {
            console.log("Senha incorreta.");
            showToast('Senha incorreta', 'error');
        }
    } else {
        console.log("Usuário não encontrado.");
        showToast('Usuário não encontrado', 'error');
    }
}

function realizarLogout() {
    usuarioLogado = null;
    localStorage.removeItem('usuarioLogado');
    window.location.hash = '';
    verificarRota();
}

function mostrarAdmin() {
    if (!usuarioLogado) {
        showLogin();
        return;
    }
    document.body.classList.remove('no-header');
    document.body.classList.remove('login-active');

    const appContainer = document.getElementById('appContainer');
    const loginSection = document.getElementById('loginSection');
    if (appContainer) appContainer.style.display = '';
    if (loginSection) loginSection.style.display = 'none';

    // Safety check for permissions on entry: Any user not explicitly an Administrator goes to reports
    const profile = (usuarioLogado.perfil || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (profile !== 'administrador') {
        showSection('relatorios');
    }

    document.getElementById('adminPage').style.display = 'flex';
    document.getElementById('desativadaPage').classList.remove('active');
    document.getElementById('agendamentoPage').classList.remove('active');
    document.getElementById('confirmacaoPage').classList.remove('active');

    renderAgendas();
    aplicarPermissoes();
}

function mostrarPaginaDesativada(titulo, mensagem) {
    document.body.classList.add('no-header');
    document.body.classList.remove('login-active');

    if (document.getElementById('adminPage')) document.getElementById('adminPage').style.display = 'none';
    if (document.getElementById('loginSection')) document.getElementById('loginSection').style.display = 'none';

    const page = document.getElementById('desativadaPage');
    if (titulo) page.querySelector('h2').textContent = titulo;
    if (mensagem) page.querySelector('p').textContent = mensagem;

    page.classList.add('active');
    document.getElementById('agendamentoPage').classList.remove('active');
    document.getElementById('confirmacaoPage').classList.remove('active');
}

function mostrarPaginaAgendamento(agenda) {
    currentPublicAgenda = agenda; // Armazena a agenda ativa para uso na pesquisa
    
    // Inicializa agendamentoData com os dados da agenda atual
    agendamentoData.agendaId = agenda.id;
    agendamentoData.agendaNome = agenda.nome;
    agendamentoData.endereco = agenda.endereco;
    
    console.log("--- mostrarPaginaAgendamento ---", agenda.nome);
    try {
        // 1. Visibilidade básica
        document.body.classList.add('no-header');
        document.body.classList.remove('login-active');
        if (document.getElementById('adminPage')) document.getElementById('adminPage').style.display = 'none';
        if (document.getElementById('loginSection')) document.getElementById('loginSection').style.display = 'none';

        document.getElementById('desativadaPage').classList.remove('active');
        document.getElementById('agendamentoPage').classList.add('active');
        document.getElementById('confirmacaoPage').classList.remove('active');

        // 2. PRIORIDADE: Popular e Travar o Select
        const selectAgenda = document.getElementById('publicAgendaSelect');
        if (selectAgenda) {
            console.log("Preenchendo selectAgenda para ID:", agenda.id);
            const opt = `<option value="${agenda.id}" selected>${agenda.nome}</option>`;
            selectAgenda.innerHTML = opt;
            selectAgenda.value = String(agenda.id);
            selectAgenda.disabled = true;

            // Reforço com delay (caso algum script de terceiros ou reset ocorra)
            setTimeout(() => {
                selectAgenda.innerHTML = opt;
                selectAgenda.value = String(agenda.id);
                selectAgenda.disabled = true;
                console.log("Reforço de seleção aplicado.");
            }, 100);
        }

        // 3. Textos de Título
        if (document.getElementById('publicAgendaNome')) document.getElementById('publicAgendaNome').textContent = agenda.nome;
        // confirmAgendaNome doesn't exist, using confirmAgenda instead if it exists
        if (document.getElementById('confirmAgenda')) document.getElementById('confirmAgenda').textContent = agenda.nome;

        // 4. Campo de Senha (converte para string e limpa lixo)
        const rowSenha = document.getElementById('publicSenhaRow');
        const inputSenha = document.getElementById('publicSenha');
        if (rowSenha && inputSenha) {
            const senhaStr = agenda.senha ? String(agenda.senha).trim() : "";
            if (senhaStr && senhaStr.toLowerCase() !== "null") {
                rowSenha.style.display = 'block';
                inputSenha.value = ''; // Limpa para novo uso
            } else {
                rowSenha.style.display = 'none';
                inputSenha.value = '';
            }
        }

        // Garante que o ícone do topo esteja no estado inicial correto
        switchPublicSection('novo');

        // 5. Carregar dados dependentes
        carregarServicosPublic(agenda);
        gerarDiasDisponiveis(agenda);

        const grid = document.getElementById('horariosGrid');
        if (grid) grid.innerHTML = '';
        const help = document.getElementById('horarioHelp');
        if (help) help.textContent = 'Selecione uma data para ver os horários';

    } catch (e) {
        console.error("Erro crítico em mostrarPaginaAgendamento:", e);
    }
}

// Handler para o onchange do HTML (se necessário)
function carregarServicos() {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
        // Se estiver em rota pública, não faz nada (está travado)
        return;
    }
}

// window.addEventListener('hashchange', verificarRota); // Removido redundante

// --- AGENDAMENTO PÚBLICO ---

function carregarServicosPublic(agenda) {
    const selectServico = document.getElementById('publicServicoSelect');
    selectServico.innerHTML = '<option value="">Selecione um serviço</option>';

    agenda.servicos.forEach(sName => {
        // Find full object definition
        const sObj = servicosDisponiveis.find(s => s.nome === sName);
        if (sObj) {
            // Removed duration text from display as requested
            selectServico.innerHTML += `<option value="${sObj.nome}" data-duracao="${sObj.duracao}">${sObj.nome}</option>`;
        }
    });
}

function gerarDiasDisponiveis(agenda) {
    const diasGrid = document.getElementById('diasGrid');
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Reset time for accurate day calculation

    // Dynamic Range: Search up to atendimentoFinal, or default 30 days
    let searchWindow = 30;
    if (agenda.atendimentoFinal) {
        const finalAtend = new Date(agenda.atendimentoFinal + 'T12:00:00'); // Midday to avoid TZ shifts
        const diffTime = finalAtend - hoje;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        searchWindow = Math.max(30, Math.min(180, diffDays)); // Min 30, Max 180 days safety cap
    }

    let html = '';

    for (let i = 0; i < searchWindow; i++) {
        const data = new Date(hoje);
        data.setDate(hoje.getDate() + i);

        const yyyy = data.getFullYear();
        const mm = String(data.getMonth() + 1).padStart(2, '0');
        const dd = String(data.getDate()).padStart(2, '0');
        const dataStr = `${yyyy}-${mm}-${dd}`;

        // Debug filtering
        const start = agenda.atendimentoInicial || '';
        const end = agenda.atendimentoFinal || '';

        // Check date limits: Must be within Atendimento range
        if (start && dataStr < start) continue;
        if (end && dataStr > end) continue;

        const diaSemana = diasSemana[data.getDay()];
        const diaNumero = data.getDate();

        // Check if day is active in schedule
        const mapDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaKey = mapDias[data.getDay()];
        if (!agenda.horarioAtendimento[diaKey] || !agenda.horarioAtendimento[diaKey].ativo) {
            continue; // Skip inactive days
        }

        html += `
            <div class="dia-btn" onclick="selecionarDia(this, '${dataStr}')" data-data="${dataStr}">
                <div class="dia-nome">${diaSemana}</div>
                <div class="dia-numero">${diaNumero}</div>
            </div>
        `;
    }

    diasGrid.innerHTML = html;
}

function selecionarDia(elemento, data) {
    document.querySelectorAll('.dia-btn').forEach(btn => btn.classList.remove('selected'));
    elemento.classList.add('selected');
    agendamentoData.data = data;
    document.getElementById('dataHelp').textContent = `Data selecionada: ${data.split('-').reverse().join('/')}`;
    document.getElementById('dataHelp').style.color = 'var(--success)';

    gerarHorariosDisponiveis(data);
}

function gerarHorariosDisponiveis(dataStr) {
    const horariosGrid = document.getElementById('horariosGrid');
    const agendaId = document.getElementById('publicAgendaSelect').value;
    const agenda = agendas.find(a => a.id == agendaId);

    // Get duration from selected service
    const servicoSelect = document.getElementById('publicServicoSelect');
    const option = servicoSelect.options[servicoSelect.selectedIndex];
    if (!option.value) {
        horariosGrid.innerHTML = '<p class="help-text">Selecione um serviço primeiro.</p>';
        return;
    }
    const duracao = parseInt(option.dataset.duracao) || 30;

    const dataObj = new Date(dataStr + 'T00:00:00');
    const mapDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const diaKey = mapDias[dataObj.getDay()];
    const configDia = agenda.horarioAtendimento[diaKey];

    let slots = [];

    // Normalize logic
    let configSlots = configDia.slots || [];
    if (!configDia.slots) {
        if (configDia.inicio1 && configDia.fim1) configSlots.push({ inicio: configDia.inicio1, fim: configDia.fim1 });
        if (configDia.inicio2 && configDia.fim2) configSlots.push({ inicio: configDia.inicio2, fim: configDia.fim2 });
    }

    configSlots.forEach(s => {
        slots = slots.concat(gerarSlotsPorDuracao(s.inicio, s.fim, duracao));
    });

    let html = '';
    slots.forEach(horario => {
        // Validation: Capacity
        const count = agendamentos.filter(a =>
            String(a.agendaId) === String(agendaId) &&
            a.data === dataStr &&
            a.horario === horario
        ).length;

        const max = parseInt(agenda.maxAgendamentosHorario) || 1;
        const isFull = count >= max;

        console.log(`Slot ${horario}: ${count}/${max} ocupados.`);

        // Hide if full instead of disabling
        if (!isFull) {
            html += `<button class="horario-btn" onclick="selecionarHorario(this, '${horario}')">${horario}</button>`;
        }
    });

    horariosGrid.innerHTML = html || '<p>Não há horários disponíveis para este dia.</p>';
}

function gerarSlotsPorDuracao(inicio, fim, duracao) {
    let slots = [];
    let atual = converteHoraMinutos(inicio);
    let final = converteHoraMinutos(fim);

    // Simple logic: Slot is start time. Next slot is start + duration.
    // Must handle fit: slot + duration <= final
    while (atual + duracao <= final) {
        slots.push(converteMinutosHora(atual));
        atual += duracao;
    }
    return slots;
}

function converteHoraMinutos(horaStr) {
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
}

function converteMinutosHora(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function selecionarHorario(elm, horario) {
    document.querySelectorAll('.horario-btn').forEach(btn => btn.classList.remove('selected'));
    elm.classList.add('selected');
    agendamentoData.horario = horario;
    document.getElementById('horarioHelp').textContent = `Horário: ${horario}`;
}

function proximoStep() {
    const agendaId = document.getElementById('publicAgendaSelect').value;
    const servico = document.getElementById('publicServicoSelect').value;
    const agenda = agendas.find(a => a.id == agendaId);

    // Validate Password
    const agendaSenha = agenda.senha ? String(agenda.senha).trim() : "";
    if (agendaSenha && agendaSenha.toLowerCase() !== "null") {
        const inputSenha = document.getElementById('publicSenha');
        if (!inputSenha || String(inputSenha.value).trim() !== agendaSenha) {
            showToast('Senha da agenda incorreta!', 'error');
            return;
        }
    }

    if (!servico) return showToast('Selecione um serviço', 'error');
    if (!agendamentoData.data) return showToast('Selecione uma data', 'error');
    if (!agendamentoData.horario) return showToast('Selecione um horário', 'error');

    agendamentoData.agendaId = agendaId;
    agendamentoData.servico = servico;
    agendamentoData.agendaNome = agenda.nome;
    agendamentoData.endereco = agenda.endereco;

    // Config UI for Step 2
    document.getElementById('step1Content').style.display = 'none';
    document.getElementById('step2Content').style.display = 'block';

    // Hide CPF/Email (Formulário Simplificado)
    document.getElementById('publicCPF').closest('.form-row-single').style.display = 'none';
    document.getElementById('publicEmail').closest('.form-row-single').style.display = 'none';

    // Setup Navigation
    document.getElementById('step1Indicator').classList.remove('active');
    document.getElementById('step2Indicator').classList.add('active');
    document.getElementById('btnVoltar').style.display = 'flex';
    document.getElementById('btnProximo').style.display = 'none';
    document.getElementById('btnConfirmar').style.display = 'flex';
}

function voltarStep() {
    document.getElementById('step1Content').style.display = 'block';
    document.getElementById('step2Content').style.display = 'none';
    document.getElementById('step1Indicator').classList.add('active');
    document.getElementById('step2Indicator').classList.remove('active');
    document.getElementById('btnVoltar').style.display = 'none';
    document.getElementById('btnProximo').style.display = 'flex';
    document.getElementById('btnConfirmar').style.display = 'none';
}

async function confirmarAgendamento() {
    const nome = document.getElementById('publicNome').value.trim();
    const telefone = document.getElementById('publicTelefone').value.trim();
    const termos = document.getElementById('termosAceite').checked;

    if (!nome) return showToast('Nome é obrigatório', 'error');
    if (!termos) return showToast('Aceite os termos', 'error');
    // Show loading
    showLoading();

    // Final Capacity Check
    const agenda = agendas.find(a => a.id == agendamentoData.agendaId);
    const count = agendamentos.filter(a =>
        String(a.agendaId) === String(agenda.id) &&
        a.data === agendamentoData.data &&
        a.horario === agendamentoData.horario &&
        a.codigo !== agendamentoData.codigo
    ).length;

    const max = parseInt(agenda.maxAgendamentosHorario, 10) || 1;
    if (count >= max) {
        hideLoading();
        showToast('Horário esgotado! Selecione outro horário.', 'error');
        voltarStep();
        gerarHorariosDisponiveis(agendamentoData.data);
        return;
    }

    agendamentoData.nome = nome;
    agendamentoData.telefone = telefone || 'Não informado';
    agendamentoData.cpf = '-';
    agendamentoData.email = '-';

    // Se não tem código (novo agendamento), gera um
    if (!agendamentoData.codigo) {
        agendamentoData.codigo = Math.random().toString(36).substr(2, 7).toUpperCase();
        agendamentos.push(agendamentoData);
    } else {
        // Se já tem código, atualiza no array local também
        const idx = agendamentos.findIndex(a => a.codigo === agendamentoData.codigo);
        if (idx !== -1) agendamentos[idx] = { ...agendamentoData };
    }

    // Aguarda salvar na nuvem antes de mostrar o recibo
    await salvarDadosCloud('saveAgendamento', agendamentoData);

    hideLoading();
    mostrarConfirmacao();
}

function mostrarConfirmacao() {
    document.body.classList.add('no-header');
    document.getElementById('agendamentoPage').classList.remove('active');
    document.getElementById('confirmacaoPage').classList.add('active');

    // Update confirmation fields
    document.getElementById('confirmCodigo').textContent = agendamentoData.codigo;
    document.getElementById('confirmAgenda').textContent = agendamentoData.agendaNome;
    document.getElementById('confirmData').textContent = limparData(agendamentoData.data);
    document.getElementById('confirmHorario').textContent = limparHorario(agendamentoData.horario);
    document.getElementById('confirmServico').textContent = agendamentoData.servico;
    document.getElementById('confirmNome').textContent = agendamentoData.nome;
    document.getElementById('confirmTelefone').textContent = agendamentoData.telefone;
    document.getElementById('confirmEndereco').textContent = agendamentoData.endereco;

    // Reset visibility of action buttons (default: all visible for new appointments)
    if (document.getElementById('btnReciboEditar')) document.getElementById('btnReciboEditar').style.display = 'flex';
    if (document.getElementById('btnReciboCancelar')) document.getElementById('btnReciboCancelar').style.display = 'flex';
}


function novoAgendamento() {
    if (confirm('Deseja iniciar um novo agendamento?')) {
        agendamentoData = {};
        const url = window.location.href.split('#')[0];
        const hash = window.location.hash;
        window.location.href = url + hash; // Mantém o hash da agenda
        window.location.reload();
    }
}

function editarAgendamento() {
    console.log("Retornando ao formulário para edição...");
    // 1. Visibilidade de páginas
    document.getElementById('confirmacaoPage').classList.remove('active');


function getUsuarioForm() {
    return `
        <div class="form-grid">
            <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" id="userName" class="form-control" placeholder="Ex: João Silva">
            </div>
            <div class="form-group">
                <label>Login / Usuário</label>
                <input type="text" id="userLogin" class="form-control" placeholder="Ex: joao.silva">
            </div>
            <div class="form-group">
                <label>Senha de Acesso</label>
                <input type="password" id="userPass" class="form-control" placeholder="Defina uma senha">
            </div>
            <div class="form-group">
                <label>Perfil de Acesso</label>
                <select id="userPerfil" class="form-control">
                    <option value="Administrador">Administrador (Acesso Total)</option>
                    <option value="Usuário">Usuário (Apenas Relatórios)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Status</label>
                <select id="userStatus" class="form-control">
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                </select>
            </div>
        </div>
    `;
}

async function saveUsuario() {
    const nome = document.getElementById('userName').value.trim();
    const login = document.getElementById('userLogin').value.trim();
    const senha = document.getElementById('userPass').value.trim();
    const perfil = document.getElementById('userPerfil').value;
    const status = document.getElementById('userStatus').value;

    if (!nome || !login || (!editingUsuarioId && !senha)) {
        return showToast('Preencha Nome, Login e Senha', 'error');
    }

    const userData = editingUsuarioId
        ? { ...usuarios.find(u => u.id === editingUsuarioId), nome, login, perfil, status }
        : { id: Date.now(), nome, login, senha, perfil, status };

    if (editingUsuarioId && senha) userData.senha = senha;

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
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
// --- FUNÇÕES LEGAIS ---
function abrirTermosDeUso() {
    const conteudo = `
        <div style="text-align: left; line-height: 1.6; color: #444;">
            <h3>Termos de Uso</h3>
            <p><strong>1. Finalidade:</strong> Os dados coletados destinam-se exclusivamente ao agendamento de atendimentos no Programa Justiça no Bairro.</p>
            <p><strong>2. Coleta de Dados:</strong> Coletamos nome, CPF, e-mail e telefone para identificar o cidadão e facilitar a comunicação sobre o agendamento.</p>
            <p><strong>3. Armazenamento:</strong> Os dados são armazenados de forma segura em infraestrutura de nuvem (Google Cloud) e acessados apenas por pessoal autorizado.</p>
            <p><strong>4. Responsabilidade:</strong> O usuário é responsável pela veracidade dos dados informados.</p>
            <p><strong>5. Cancelamento:</strong> O usuário pode solicitar a exclusão de seus dados após o atendimento, conforme a LGPD.</p>
        </div>
    `;
    mostrarModalGeral("Termos de Uso", conteudo);
}

function abrirPoliticaPrivacidade() {
    const conteudo = `
        <div style="text-align: left; line-height: 1.6; color: #444;">
            <h3>Política de Privacidade</h3>
            <p>Esta política descreve como tratamos suas informações pessoais:</p>
            <ul>
                <li><strong>Privacidade:</strong> Não compartilhamos seus dados com terceiros para fins comerciais.</li>
                <li><strong>Uso:</strong> Seus dados são usados apenas para a gestão das agendas e estatísticas internas do programa.</li>
                <li><strong>Segurança:</strong> Utilizamos protocolos de segurança para proteger suas informações contra acesso não autorizado.</li>
                <li><strong>Direitos:</strong> Você tem o direito de consultar, corrigir ou excluir seus dados a qualquer momento.</li>
            </ul>
        </div>
    `;
    mostrarModalGeral("Política de Privacidade", conteudo);
}

function mostrarModalGeral(titulo, html) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    if (overlay && title && body) {
        title.innerText = titulo;
        body.innerHTML = html;
        overlay.style.display = 'flex';
        
        // Esconde botões do footer se for apenas informativo
        const footer = overlay.querySelector('.modal-footer');
        if (footer) footer.style.display = 'none';
    }
}

// Sobrescrever closeModal para garantir que o footer volte ao normal
const originalCloseModal = window.closeModal;
window.closeModal = function() {
    const footer = document.querySelector('.modal-overlay .modal-footer');
    if (footer) footer.style.display = 'flex';
    if (typeof originalCloseModal === 'function') originalCloseModal();
    else {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) overlay.style.display = 'none';
    }
};
