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
    
    // Só mostra o loader se Nﾃグ estiver em background, Nﾃグ tiver cache válido, e Nﾃグ for página pública
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
    enderecosDisponiveis = (data.enderecos && data.enderecos.length > 0) ? data.enderecos : ["Av. Pres. Kennedy, n.ﾂｺ 900, Bairro Centro, Telêmaco Borba"];

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
    
    // Se Nﾃグ for rota pública (sem hash), podemos mostrar o login/admin logo (usando cache se existir)
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

    // 2. Fluxo Administrativo (apenas se Nﾃグ houver slug no link)
    if (!usuarioLogado) {
        console.log("Nenhum slug detectado e usuário não logado. Mostrando login.");
        showLogin();
        return;
    }

    // Usuário Logado - ﾃ〉ea Admin
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

// --- AGENDAMENTO Pﾃ咤LICO ---

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
    document.getElementById('agendamentoPage').classList.add('active');

    // 2. Reseta Step UI
    document.getElementById('step2Content').style.display = 'none';
    document.getElementById('step1Content').style.display = 'block';
    document.getElementById('step2Indicator').classList.remove('active');
    document.getElementById('step1Indicator').classList.add('active');

    // 3. Reseta botões
    document.getElementById('btnVoltar').style.display = 'none';
    document.getElementById('btnProximo').style.display = 'flex';
    document.getElementById('btnConfirmar').style.display = 'none';

    showToast('Ajuste os dados e avance novamente.');
}

async function cancelarAgendamento() {
    if (confirm('Tem certeza que deseja CANCELAR este agendamento? Ele será excluído permanentemente da nuvem.')) {
        showLoading();

        if (agendamentoData && agendamentoData.codigo) {
            // Remove do array local imediatamente
            const idx = agendamentos.findIndex(a => a.codigo === agendamentoData.codigo);
            if (idx !== -1) agendamentos.splice(idx, 1);
            
            // Guarda código antes de limpar
            // Guarda código antes de limpar
            const codigoParaDeletar = agendamentoData.codigo;
            
            // Aguarda excluir na nuvem antes de navegar
            const sucesso = await salvarDadosCloud('deleteAgendamento', { codigo: codigoParaDeletar });
            
            hideLoading();
            if (sucesso) {
                agendamentoData = {};
                showToast('Agendamento cancelado com sucesso.');
                resetFormularioAgendamento();
            } else {
                showToast('Erro ao cancelar. Tente novamente.', 'error');
            }
        } else {
            // Se ainda não salvou na nuvem, apenas reseta
            hideLoading();
            resetFormularioAgendamento();
        }
    }
}


function resetFormularioAgendamento() {
    console.log('--- resetFormularioAgendamento ---');
    agendamentoData = {};
    currentStep = 1;
    document.querySelectorAll('.public-page').forEach(p => p.classList.remove('active'));
    const agendamentoPage = document.getElementById('agendamentoPage');
    if (agendamentoPage) agendamentoPage.classList.add('active');
    if (typeof currentPublicAgenda !== 'undefined' && currentPublicAgenda) {
        mostrarPaginaAgendamento(currentPublicAgenda);
    }
    switchPublicSection('novo');
    const s1 = document.getElementById('step1Content');
    const s2 = document.getElementById('step2Content');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    const i1 = document.getElementById('step1Indicator');
    const i2 = document.getElementById('step2Indicator');
    if (i1) i1.classList.add('active');
    if (i2) i2.classList.remove('active');
    const bV = document.getElementById('btnVoltar');
    const bP = document.getElementById('btnProximo');
    const bC = document.getElementById('btnConfirmar');
    if (bV) bV.style.display = 'none';
    if (bP) bP.style.display = 'flex';
    if (bC) bC.style.display = 'none';
    ['publicNome', 'publicTelefone', 'publicCPF', 'publicEmail', 'termosAceite'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { if (el.type === 'checkbox') el.checked = false; else el.value = ''; }
    });
    document.querySelectorAll('.dia-btn.selected').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.horario-btn.selected').forEach(b => b.classList.remove('selected'));
    const hG = document.getElementById('horariosGrid');
    if (hG) hG.innerHTML = '';
    const hH = document.getElementById('horarioHelp');
    if (hH) hH.textContent = 'Selecione uma data para ver os hor�rios';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- NAVEGAÇÃO PÚBLICA & PESQUISA ---

function switchPublicSection(section) {
    const navNovo = document.getElementById('navNovo');
    const navPesquisa = document.getElementById('navPesquisa');
    const secNovo = document.getElementById('novoAgendamentoSection');
    const secPesquisa = document.getElementById('pesquisaAgendamentoSection');

    if (section === 'novo') {
        if (navNovo) navNovo.classList.add('active-teal');
        if (navPesquisa) navPesquisa.classList.remove('active-teal');
        if (secNovo) secNovo.style.display = 'block';
        if (secPesquisa) secPesquisa.style.display = 'none';
    } else if (section === 'pesquisa') {
        if (navNovo) navNovo.classList.remove('active-teal');
        if (navPesquisa) navPesquisa.classList.add('active-teal');
        if (secNovo) secNovo.style.display = 'none';
        if (secPesquisa) secPesquisa.style.display = 'block';
    }
}

function pesquisarAgendamento() {
    const input = document.getElementById('publicSearchInput');
    if (!input) return;
    const query = input.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('publicSearchResults');

    if (!query) {
        resultsContainer.innerHTML = `
            <div class="empty-results">
                <i class="fas fa-calendar-search"></i>
                <p>Digite algo para pesquisar seu agendamento.</p>
            </div>`;
        return;
    }

    // Filtrar agendamentos por nome, telefone ou código E PELA AGENDA ATUAL
    const filtered = agendamentos.filter(a => 
        String(a.agendaId) === String(currentPublicAgenda ? currentPublicAgenda.id : '') && (
            (a.nome || '').toLowerCase().includes(query) ||
            (a.telefone || '').includes(query) ||
            (a.codigo || '').toLowerCase().includes(query)
        )
    );

    if (filtered.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-results">
                <i class="fas fa-search-minus"></i>
                <p>Nenhum agendamento encontrado.</p>
            </div>`;
        return;
    }

    resultsContainer.innerHTML = filtered.map(a => `
        <div class="search-result-card">
            <div class="result-info">
                <div class="result-name">${a.nome}</div>
                <div class="result-meta">
                    <span><i class="fas fa-calendar-alt"></i> ${limparData(a.data)}</span>
                    <span><i class="fas fa-clock"></i> ${a.horario}</span>
                    <span><i class="fas fa-hashtag"></i> ${a.codigo}</span>
                </div>
            </div>
            <button class="btn-view-result" onclick="exibirAgendamentoConsultado('${a.codigo}')">
                <i class="fas fa-eye"></i> Visualizar Recibo
            </button>
        </div>
    `).join('');
}

function exibirAgendamentoConsultado(codigo) {
    const found = agendamentos.find(a => a.codigo === codigo);
    if (found) {
        agendamentoData = { ...found };
        
        // CORREﾃ�グ: Repopular nome da agenda e endereço caso venham vazios da nuvem
        if (!agendamentoData.agendaNome || !agendamentoData.endereco) {
            const agenda = agendas.find(g => String(g.id) === String(found.agendaId));
            if (agenda) {
                agendamentoData.agendaNome = agenda.nome;
                agendamentoData.endereco = agenda.endereco;
            }
        }
        
        // Garantir que a tela de confirmação mostre os dados
        mostrarConfirmacao();
        
        // OCULTAR botões de edição/cancelamento quando vem da consulta por pesquisa
        if (document.getElementById('btnReciboEditar')) document.getElementById('btnReciboEditar').style.display = 'none';
        if (document.getElementById('btnReciboCancelar')) document.getElementById('btnReciboCancelar').style.display = 'none';
        
        // Scroll para o topo
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        showToast('Agendamento não encontrado', 'error');
    }
}


// --- ADMIN ---

function voltarAdmin() {
    agendamentoData = {};
    window.location.hash = ''; // Clear hash, verificarRota will handle logic
}

function toggleFilters() {
    const filters = document.getElementById('filtersSection');
    filters.classList.toggle('active');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

let _bounceFilters = null;
function debouncedApplyFilters() {
    if (!_bounceFilters) {
        _bounceFilters = debounce(() => applyFilters(), 200);
    }
    _bounceFilters();
}

function applyFilters() {
    const query = document.getElementById('agendaSearch').value.toLowerCase().trim();
    const status = document.getElementById('filterStatus').value;
    const tipo = document.getElementById('filterTipo').value;
    const local = document.getElementById('filterLocal').value.toLowerCase().trim();
    const servico = document.getElementById('filterServico').value.toLowerCase().trim();

    const filtered = agendas.filter(agenda => {
        const matchSearch = !query || agenda.nome.toLowerCase().includes(query);
        const matchStatus = !status || agenda.status === status;
        const matchTipo = !tipo || (agenda.tipo || '').toLowerCase() === tipo;
        const matchLocal = !local || (agenda.endereco || '').toLowerCase().includes(local);
        const matchServico = !servico || (agenda.servicos || []).some(s => s.nome.toLowerCase().includes(servico));

        return matchSearch && matchStatus && matchTipo && matchLocal && matchServico;
    });

    renderAgendas(filtered);
}

function calcularHorariosLivres(agenda, agendamentosAgendaLength) {
    if (!agenda.atendimentoInicial || !agenda.atendimentoFinal) return 'N/A';

    const ini = new Date(agenda.atendimentoInicial + 'T12:00:00');
    const fim = new Date(agenda.atendimentoFinal + 'T12:00:00');

    if (isNaN(ini) || isNaN(fim)) return 'N/A';

    let minDuracao = 30; // default
    if (agenda.servicos && agenda.servicos.length > 0) {
        const servicosAgenda = servicosDisponiveis.filter(s => agenda.servicos.includes(s.nome));
        if (servicosAgenda.length > 0) {
            minDuracao = Math.min(...servicosAgenda.map(s => parseInt(s.duracao) || 30));
        }
    }

    const mapDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    let curr = new Date(ini);
    let totalSlots = 0;

    while (curr <= fim) {
        const diaKey = mapDias[curr.getDay()];
        const configDia = agenda.horarioAtendimento && agenda.horarioAtendimento[diaKey];

        if (configDia && configDia.ativo) {
            let configSlots = configDia.slots || [];
            if (!configDia.slots) {
                if (configDia.inicio1 && configDia.fim1) configSlots.push({ inicio: configDia.inicio1, fim: configDia.fim1 });
                if (configDia.inicio2 && configDia.fim2) configSlots.push({ inicio: configDia.inicio2, fim: configDia.fim2 });
            }

            configSlots.forEach(s => {
                totalSlots += gerarSlotsPorDuracao(s.inicio, s.fim, minDuracao).length;
            });
        }
        curr.setDate(curr.getDate() + 1);
    }

    // In other places, maxAgendamentosHorario falls back to 6 visually but might be 1 internally or undefined.
    // If it's saved as 0 or undefined, default is usually 6 based on HTML line 975.
    const maxPorHorario = parseInt(agenda.maxAgendamentosHorario) || (agenda.maxAgendamentosHorario === 0 ? 0 : 6);
    const capacidadeTotal = totalSlots * maxPorHorario;

    const livres = capacidadeTotal - agendamentosAgendaLength;
    return livres < 0 ? 0 : livres;
}

function renderAgendas(filtered = null) {
    const container = document.getElementById('agendasContainer');
    const data = filtered || agendas;
    const baseUrl = window.location.href.split('#')[0];

    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Nenhuma agenda</h3></div>';
        return;
    }

    container.innerHTML = data.map(agenda => {
        const link = `${baseUrl}#/${agenda.slug}`;

        // Helper to handle Google Sheets ISO Dates
        const formatSheetDate = (d) => {
            if (!d) return '---';
            const s = String(d).trim();
            // Se já estiver em DD/MM/YYYY, retorna direto
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
            // Se estiver em YYYY-MM-DD ou ISO
            const datePart = s.includes('T') ? s.split('T')[0] : s;
            if (datePart.includes('-')) {
                return datePart.split('-').reverse().join('/');
            }
            return s;
        };

        const dataInicio = formatSheetDate(agenda.dataInicial);
        const dataFim = formatSheetDate(agenda.ultimaData);

        // Format Horarios
        const diasSemana = { 'seg': 'Seg', 'ter': 'Ter', 'qua': 'Qua', 'qui': 'Qui', 'sex': 'Sex', 'sab': 'Sab', 'dom': 'Dom' };
        let horariosHtml = Object.entries(diasSemana).map(([key, label]) => {
            const h = agenda.horarioAtendimento?.[key];
            if (!h || !h.ativo) return '';

            // Normalize slots
            let slots = h.slots || [];
            if (!h.slots && (h.inicio1 || h.inicio2)) {
                if (h.inicio1 && h.fim1) slots.push({ inicio: h.inicio1, fim: h.fim1 });
                if (h.inicio2 && h.fim2) slots.push({ inicio: h.inicio2, fim: h.fim2 });
            }

            if (slots.length === 0) return '';
            const times = slots.map(s => `${s.inicio} - ${s.fim}`).join(' | ');
            return `<div>${label}: ${times}</div>`;
        }).join('');
        if (horariosHtml === '') horariosHtml = '<div>Sem horários cadastrados</div>';

        return `
        <div class="agenda-card" style="border-top: 5px solid ${agenda.status === 'active' ? 'var(--success)' : 'var(--danger)'}">
            <div class="card-header" style="background: white; border-bottom: none; padding-bottom: 0;">
                <div class="card-title-section">
                    <h3 class="card-title" style="font-size: 20px;">${agenda.nome}</h3>
                </div>
                <div class="card-actions admin-only flex">
                    <button class="icon-btn settings" title="Configurações" onclick="editAgenda(${agenda.id})" style="background: #e3f2fd; color: #2196f3;"><i class="fas fa-cog"></i></button>
                    <button class="icon-btn copy" title="Duplicar/Copiar" onclick="navigator.clipboard.writeText('${link}'); showToast('Link Copiado!')" style="background: #e8f5e9; color: #4caf50;"><i class="fas fa-copy"></i></button>
                    <button class="icon-btn delete" title="Excluir Agenda" onclick="excluirAgenda(${agenda.id})" style="background: #ffebee; color: #f44336;"><i class="fas fa-trash"></i></button>
                </div>
            </div>

            <div class="card-body">
                <div class="badges" style="margin-bottom: 15px;">
                    <span class="badge ${agenda.status === 'active' ? 'badge-success' : 'badge-danger'}">
                        ${agenda.status === 'active' ? 'ATIVA' : 'DESATIVADA'}
                    </span>
                    <span class="badge badge-info">LINK PERSONALIZADO</span>
                    <a href="${link}" target="_blank" class="btn btn-view" style="text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 11px; padding: 6px 15px;">
                        <i class="fas fa-eye"></i> VER AGENDA
                    </a>
                </div>

                <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; font-size: 13px; color: #0288d1; word-break: break-all; margin-bottom: 15px;">
                    <strong>Link da Agenda:</strong><br>
                    <a href="${link}" target="_blank" style="color: #0288d1; text-decoration: none;">${link}</a>
                </div>

                <!-- Vigência, Atendimento & Senha -->
                <div style="background: #fff3e0; padding: 12px; border-radius: 8px; border: 1px solid #ffe0b2; margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <strong style="color: #e65100; font-size: 11px; text-transform: uppercase;">Vigência</strong><br>
                            <span style="font-size: 13px;">${dataInicio} até ${dataFim}</span>
                        </div>
                        <div style="text-align: right;">
                            <strong style="color: #e65100; font-size: 11px; text-transform: uppercase;">Senha</strong><br>
                            <span style="font-size: 13px;">${agenda.senha || '---'}</span>
                        </div>
                    </div>
                    <div style="border-top: 1px dashed #ffd180; padding-top: 5px;">
                        <strong style="color: #e65100; font-size: 11px; text-transform: uppercase;">Atendimento</strong><br>
                        <span style="font-size: 13px;">${formatSheetDate(agenda.atendimentoInicial)} até ${formatSheetDate(agenda.atendimentoFinal)}</span>
                    </div>
                </div>

                <div class="info-group" style="margin-bottom: 10px;">
                    <strong style="font-size: 12px; color: #666; text-transform: uppercase;">Endereço:</strong>
                    <div style="font-size: 14px; color: #333;">${agenda.endereco || 'Não informado'}</div>
                </div>

                <div class="info-group" style="margin-bottom: 15px;">
                    <strong style="font-size: 12px; color: #666; text-transform: uppercase;">Horário de Atendimento:</strong>
                    <div style="font-size: 13px; color: #444; margin-top: 5px; line-height: 1.6;">
                        ${horariosHtml}
                    </div>
                </div>

                <div class="info-group" style="margin-bottom: 10px;">
                    <strong style="font-size: 12px; color: #666; text-transform: uppercase;">Campos Solicitados:</strong>
                    <div style="font-size: 14px;">Nome${agenda.senha ? ', Senha' : ''}</div>
                </div>

                <div class="info-group" style="margin-bottom: 15px;">
                    <strong style="font-size: 12px; color: #666; text-transform: uppercase;">Serviços:</strong>
                    <div class="services-list" style="margin-top: 5px;">
                        ${(agenda.servicos || []).map(s => `<span class="service-tag">${s}</span>`).join('')}
                    </div>
                </div>

                <div style="border-top: 1px solid #eee; padding-top: 10px; margin-top: 10px;">
                    <div style="font-size: 13px; color: #666; margin-bottom: 5px;">
                        <strong>Formulários:</strong><br>
                        Número de Agendamentos Futuros: ${agendamentos.filter(a => a.agendaId == agenda.id).length}<br>
                        Número de Horários Livres: ${calcularHorariosLivres(agenda, agendamentos.filter(a => a.agendaId == agenda.id).length)}<br>
                    </div>
                    <div style="font-size: 13px; color: #666;">
                        <strong>Quantidade Máxima de Agendamentos por Horário:</strong><br>
                        ${agenda.maxAgendamentosHorario || 6}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Modal handling
function openModal(type) {
    const modal = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    const footer = document.querySelector('.modal-footer');

    modal.classList.add('active');

    let footerHtml = '';

    if (type === 'add') {
        title.textContent = editingAgendaId ? 'Adicionar/Editar Agenda' : 'Nova Agenda';
        body.innerHTML = getAgendaForm();
        footerHtml = `
            <button class="btn btn-cancel" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="saveAgenda()">
                <i class="fas fa-save"></i> Salvar
            </button>
        `;
    } else if (type === 'addUser') {
        title.textContent = editingUsuarioId ? 'Editar Usuário' : 'Novo Usuário';
        body.innerHTML = getUsuarioForm();
        footerHtml = `
            <button class="btn btn-cancel" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="saveUsuario()">
                <i class="fas fa-save"></i> ${editingUsuarioId ? 'Salvar Alterações' : 'Salvar Usuário'}
            </button>
        `;

        // Se estiver editando, preencher os campos
        if (editingUsuarioId) {
            const user = usuarios.find(u => u.id === editingUsuarioId);
            if (user) {
                // Pequeno delay para garantir que o DOM renderizou o form
                setTimeout(() => {
                    if (document.getElementById('userName')) document.getElementById('userName').value = user.nome;
                    if (document.getElementById('userLogin')) document.getElementById('userLogin').value = user.login;
                    if (document.getElementById('userPerfil')) document.getElementById('userPerfil').value = user.perfil;
                    if (document.getElementById('userStatus')) document.getElementById('userStatus').value = user.status;
                    if (document.getElementById('userPass')) document.getElementById('userPass').value = user.senha || '';
                }, 10);
            }
        }

    } else if (type === 'servicos') {
        title.textContent = 'Gerenciar Serviços e Duração';
        body.innerHTML = getServicosForm();
        footerHtml = `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
    } else if (type === 'enderecos') {
        title.textContent = 'Endereços de Atendimento';
        body.innerHTML = getEnderecosForm();
        footerHtml = `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
    }

    if (footer) footer.innerHTML = footerHtml;
}

function getAgendaForm() {
    const agenda = editingAgendaId ? agendas.find(a => a.id === editingAgendaId) : {};

    return `
        <div class="form-row">
            <div class="form-group"><label>Nome</label><input class="form-control" id="formNome" value="${agenda.nome || ''}" oninput="gerarSlug()"></div>
            <div class="form-group"><label>Slug</label><input class="form-control" id="formSlug" value="${agenda.slug || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Vigência inicial</label><input type="date" class="form-control" id="formDataIni" value="${agenda.dataInicial || ''}"></div>
            <div class="form-group"><label>Vigência Final</label><input type="date" class="form-control" id="formDataFim" value="${agenda.ultimaData || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Data de atendimento inicial</label><input type="date" class="form-control" id="formAtendIni" value="${agenda.atendimentoInicial || ''}"></div>
            <div class="form-group"><label>Data de atendimento Final</label><input type="date" class="form-control" id="formAtendFim" value="${agenda.atendimentoFinal || ''}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Senha (Opcional)</label><input type="text" class="form-control" id="formSenha" value="${agenda.senha || ''}"></div>
            <div class="form-group"><label>Status</label>
                <select class="form-control" id="formStatus">
                    <option value="active" ${agenda.status === 'active' ? 'selected' : ''}>Ativa</option>
                    <option value="inactive" ${agenda.status !== 'active' ? 'selected' : ''}>Inativa</option>
                </select>
            </div>
        </div>
        
        <div class="form-group">
            <label>Máx. Agendamentos por Horário</label>
            <input type="number" class="form-control" id="formMaxAgendamentos" value="${agenda.maxAgendamentosHorario || 6}">
        </div>
        
        <div class="form-group">
            <label>Endereço</label>
            <input class="form-control" id="formEndereco" list="enderecosDataList" value="${agenda.endereco || ''}" placeholder="Pesquise ou digite o endereço...">
            <datalist id="enderecosDataList">
                ${enderecosDisponiveis.map(e => `<option value="${e}">`).join('')}
            </datalist>
        </div>

        <div class="horario-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <div class="horario-title" style="margin-bottom: 20px; color: #333; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                <i class="far fa-clock"></i> Horários
            </div>
            ${['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map(d => {
        let h = agenda.horarioAtendimento?.[d] || { ativo: false };
        let slots = h.slots || [];
        // Migration
        if (!h.slots && (h.inicio1 || h.inicio2)) {
            if (h.inicio1 && h.fim1) slots.push({ inicio: h.inicio1, fim: h.fim1 });
            if (h.inicio2 && h.fim2) slots.push({ inicio: h.inicio2, fim: h.fim2 });
        }
        if (h.ativo && slots.length === 0) {
            slots.push({ inicio: '09:00', fim: '12:00' });
            slots.push({ inicio: '13:00', fim: '16:00' });
        }

        const mapDias = {
            'seg': 'Segunda', 'ter': 'Terça', 'qua': 'Quarta', 'qui': 'Quinta',
            'sex': 'Sexta', 'sab': 'Sábado', 'dom': 'Domingo'
        };

        return `
            <div class="horario-row-container" id="container_${d}" style="margin-bottom: 15px; display: flex; align-items: flex-start; gap: 20px;">
                <div style="display: flex; align-items: center; gap: 8px; width: 120px; padding-top: 8px;">
                    <input type="checkbox" id="h_${d}_a" ${h.ativo ? 'checked' : ''} onchange="toggleDia('${d}')" style="transform: scale(1.2);"> 
                    <label for="h_${d}_a" style="margin: 0; font-weight: 500; cursor: pointer; color: #555; font-size: 14px;">${mapDias[d]}</label>
                    <!-- Button moved to slot row -->
                </div>
                <div id="slots_${d}" style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
                    ${slots.map((s) => `
                        <div class="slot-row" style="display: flex; align-items: center; gap: 15px;">
                            <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
                                <input type="time" class="form-control slot-start" value="${s.inicio}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
                            </div>
                            <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
                                <input type="time" class="form-control slot-end" value="${s.fim}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button type="button" class="icon-btn" onclick="addSlot('${d}')" style="color: #00bfa5; background: #e0f2f1; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-plus"></i></button>
                                <button type="button" class="icon-btn" onclick="this.closest('.slot-row').remove()" style="color: #ef5350; background: #ffebee; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }).join('')}
        </div>

         <div class="form-group" style="margin-top: 20px;">
            <label>Serviços desta Agenda</label>
            <div class="services-selection">
                ${servicosDisponiveis
            .sort((a, b) => (parseInt(a.nome) || 999999) - (parseInt(b.nome) || 999999))
            .map(s => `
                    <label class="checkbox-item">
                        <input type="checkbox" class="servico-cb" value="${s.nome}" ${(agenda.servicos || []).includes(s.nome) ? 'checked' : ''}>
                        ${s.nome} (${s.duracao}m)
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function toggleDia(d) {
    const active = document.getElementById(`h_${d}_a`).checked;
    const container = document.getElementById(`slots_${d}`);
    if (active && container.children.length === 0) {
        addSlot(d, '09:00', '12:00');
        addSlot(d, '13:00', '16:00');
    }
}

function addSlot(d, inicio = '', fim = '') {
    const container = document.getElementById(`slots_${d}`);
    const div = document.createElement('div');
    div.className = 'slot-row';
    div.style.cssText = 'display: flex; align-items: center; gap: 15px;';
    div.innerHTML = `
        <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
            <input type="time" class="form-control slot-start" value="${inicio}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
        </div>
        <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
            <input type="time" class="form-control slot-end" value="${fim}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
        </div>
        <div style="display: flex; gap: 5px;">
            <button type="button" class="icon-btn" onclick="addSlot('${d}')" style="color: #00bfa5; background: #e0f2f1; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-plus"></i></button>
            <button type="button" class="icon-btn" onclick="this.closest('.slot-row').remove()" style="color: #ef5350; background: #ffebee; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-trash-alt"></i></button>
        </div>
    `;
    container.appendChild(div);
}

async function saveAgenda() {
    const nome = document.getElementById('formNome').value;
    const slug = document.getElementById('formSlug').value;
    if (!nome || !slug) return showToast('Preencha nome e slug', 'error');

    const servicos = Array.from(document.querySelectorAll('.servico-cb:checked')).map(cb => cb.value);

    // Build Horario Object
    const horarioAtendimento = {};
    ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].forEach(d => {
        const slotsDivs = document.querySelectorAll(`#slots_${d} .slot-row`);
        const slots = Array.from(slotsDivs).map(row => ({
            inicio: row.querySelector('.slot-start').value,
            fim: row.querySelector('.slot-end').value
        })).filter(s => s.inicio && s.fim);

        horarioAtendimento[d] = {
            ativo: document.getElementById(`h_${d}_a`).checked,
            slots: slots
        };
    });

    const newAgenda = {
        id: editingAgendaId || Date.now(),
        nome,
        slug,
        dataInicial: document.getElementById('formDataIni').value,
        ultimaData: document.getElementById('formDataFim').value,
        atendimentoInicial: document.getElementById('formAtendIni').value,
        atendimentoFinal: document.getElementById('formAtendFim').value,
        senha: document.getElementById('formSenha').value,
        status: document.getElementById('formStatus').value,
        endereco: document.getElementById('formEndereco').value,
        servicos,
        horarioAtendimento,
        maxAgendamentosHorario: parseInt(document.getElementById('formMaxAgendamentos').value) || 1, // Capture value
        camposSolicitados: ['Nome'],
        formularios: 0, agendamentosFuturos: 0, horariosLivres: 0 // Stats placeholders
    };

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
}

function gerarSlug() {
    if (editingAgendaId) return;
    const nome = document.getElementById('formNome').value;
    document.getElementById('formSlug').value = nome.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function editAgenda(id) {
    editingAgendaId = id;
    openModal('add');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    editingAgendaId = null;
    editingUsuarioId = null;
}

// Services management
function getServicosForm() {
    // Sort logic: Get number prefix
    const list = servicosDisponiveis.map((s, i) => ({ s, i }));
    list.sort((a, b) => {
        const numA = parseInt(a.s.nome) || 999999;
        const numB = parseInt(b.s.nome) || 999999;
        return numA - numB;
    });

    return `
        <div class="form-row" style="align-items: flex-start;">
            <div class="form-group" style="flex: 2;">
                <input id="newServName" class="form-control" placeholder="Nome do Serviço" style="margin-top: 0;">
            </div>
            <div class="form-group" style="flex: 1; display: flex; flex-direction: column; gap: 5px;">
                <select id="newServDur" class="form-control" style="margin-top: 0;">
                    <option value="15">15 Minutos</option>
                    <option value="30">30 Minutos</option>
                    <option value="45">45 Minutos</option>
                    <option value="60">1 Hora</option>
                </select>
                <button class="btn btn-primary" style="width: 100%; margin-top: 0;" onclick="addServico()">Adicionar</button>
            </div>
        </div>
        
        <hr>
        <div style="max-height: 300px; overflow-y: auto;">
            ${list.map(item => `
                <div style="padding: 10px; border-bottom: 1px solid #eee; display:flex; justify-content:space-between; align-items: center;">
                    <span style="flex-grow: 1;">${item.s.nome}</span>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-weight: bold;">${item.s.duracao} min</span>
                        <button class="icon-btn" style="color:red;" onclick="delServico(${item.i})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function addServico() {
    const nome = document.getElementById('newServName').value;
    const duracao = parseInt(document.getElementById('newServDur').value);
    if (nome) {
        const tempList = [...servicosDisponiveis, { nome, duracao }];
        const suceso = await salvarDadosCloud('saveServicos', tempList);
        if (suceso) {
            servicosDisponiveis = tempList;
            openModal('servicos'); // Refresh
        }
    }
}
async function delServico(i) {
    if (confirm('Deseja excluir este serviço?')) {
        const tempList = servicosDisponiveis.filter((_, index) => index !== i);
        const suceso = await salvarDadosCloud('saveServicos', tempList);
        if (suceso) {
            servicosDisponiveis = tempList;
            openModal('servicos');
        }
    }
}

function getEnderecosForm() {
    return `
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">Cadastre os locais de atendimento preenchendo os campos abaixo.</p>
        
        <div class="address-entry-form" style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #eee;">
            <div class="form-row" style="grid-template-columns: 2fr 1fr;">
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">País:</label>
                    <select id="endPais" class="form-control"><option>Brasil</option></select>
                 </div>
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Estado:</label>
                    <select id="endEstado" class="form-control">
                        <option value="PR">Paraná</option>
                        <option value="AC">Acre</option>
                        <option value="AL">Alagoas</option>
                        <option value="AP">Amapá</option>
                        <option value="AM">Amazonas</option>
                        <option value="BA">Bahia</option>
                        <option value="CE">Ceará</option>
                        <option value="DF">Distrito Federal</option>
                        <option value="ES">Espírito Santo</option>
                        <option value="GO">Goiás</option>
                        <option value="MA">Maranhão</option>
                        <option value="MT">Mato Grosso</option>
                        <option value="MS">Mato Grosso do Sul</option>
                        <option value="MG">Minas Gerais</option>
                        <option value="PA">Pará</option>
                        <option value="PB">Paraíba</option>
                        <option value="PE">Pernambuco</option>
                        <option value="PI">Piauí</option>
                        <option value="RJ">Rio de Janeiro</option>
                        <option value="RN">Rio Grande do Norte</option>
                        <option value="RS">Rio Grande do Sul</option>
                        <option value="RO">Rondﾃｴnia</option>
                        <option value="RR">Roraima</option>
                        <option value="SC">Santa Catarina</option>
                        <option value="SP">São Paulo</option>
                        <option value="SE">Sergipe</option>
                        <option value="TO">Tocantins</option>
                    </select>
                 </div>
            </div>

            <div class="form-row" style="grid-template-columns: 2fr 1fr;">
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Município:</label>
                    <input id="endMunicipio" class="form-control" placeholder="Ex: Rolândia">
                 </div>
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">CEP:</label>
                    <input id="endCep" class="form-control" placeholder="86600000">
                 </div>
            </div>

            <div class="form-row" style="grid-template-columns: 3fr 1fr;">
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Logradouro:</label>
                    <input id="endLogradouro" class="form-control" placeholder="Ex: Avenida das Palmeiras">
                 </div>
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Número:</label>
                    <input id="endNumero" class="form-control" placeholder="300">
                 </div>
            </div>

            <div class="form-row">
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Complemento:</label>
                    <input id="endComplemento" class="form-control" placeholder="Ex: Ginásio de Esportes">
                 </div>
                 <div class="form-group">
                    <label style="font-size: 11px; text-transform: uppercase; color: #777;">Bairro:</label>
                    <input id="endBairro" class="form-control" placeholder="Vila Oliveira">
                 </div>
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="font-size: 11px; text-transform: uppercase; color: #777;">Distrito:</label>
                <input id="endDistrito" class="form-control">
            </div>

            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" onclick="addEndereco()" style="flex: 1; justify-content: center;">
                    <i class="fas fa-save"></i> SALVAR ENDEREﾃ⑯
                </button>
            </div>
        </div>

        <h3 style="font-size: 16px; margin-bottom: 15px; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">Endereços Cadastrados</h3>
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto; padding-right: 5px;">
            ${enderecosDisponiveis.map((end, i) => `
                <div style="background: white; padding: 12px 15px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #eee; border-left: 4px solid #00bfa5;">
                    <div style="display: flex; align-items: center; gap: 12px; color: #555; font-size: 13px;">
                        <i class="fas fa-map-marker-alt" style="color: #00bfa5;"></i>
                        <span>${end}</span>
                    </div>
                    <button class="icon-btn" onclick="delEndereco(${i})" style="background: #ffebee; color: #ef5350; width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center; flex-shrink: 0;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('')}
            ${enderecosDisponiveis.length === 0 ? '<p style="text-align: center; color: #999; font-style: italic;">Nenhum endereço cadastrado.</p>' : ''}
        </div>
    `;
}

async function addEndereco() {
    const logradouro = document.getElementById('endLogradouro').value.trim();
    const numero = document.getElementById('endNumero').value.trim();
    const bairro = document.getElementById('endBairro').value.trim();
    const municipio = document.getElementById('endMunicipio').value.trim();
    const estado = document.getElementById('endEstado').value;
    const cep = document.getElementById('endCep').value.trim();
    const complemento = document.getElementById('endComplemento').value.trim();

    if (!logradouro || !municipio) {
        return showToast('Logradouro e Município são obrigatórios', 'error');
    }

    // Formatar como string completa: Logradouro, nﾂｺ Numero - Bairro, Cidade/UF, CEP
    let endFull = `${logradouro}`;
    if (numero) endFull += `, nﾂｺ ${numero}`;
    if (complemento) endFull += ` (${complemento})`;
    if (bairro) endFull += ` - ${bairro}`;
    if (municipio) endFull += `, ${municipio}`;
    if (estado) endFull += `/${estado}`;
    if (cep) endFull += ` - CEP: ${cep}`;

    const tempList = [...enderecosDisponiveis, endFull];
    const suceso = await salvarDadosCloud('saveEnderecos', tempList);
    if (suceso) {
        enderecosDisponiveis = tempList;
        openModal('enderecos');
        showToast('Endereço cadastrado com sucesso!');
    }
}

async function delEndereco(index) {
    if (confirm('Deseja excluir este endereço?')) {
        const tempList = enderecosDisponiveis.filter((_, i) => i !== index);
        const suceso = await salvarDadosCloud('saveEnderecos', tempList);
        if (suceso) {
            enderecosDisponiveis = tempList;
            openModal('enderecos');
        }
    }
}

// RELATﾃ迭IOS PDF
// RELATﾃ迭IOS PDF
// --- PERMISSﾃ髭S E USUﾃヽIOS ---
function aplicarPermissoes() {
    if (!usuarioLogado) return;

    const profile = (usuarioLogado.perfil || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isAdmin = profile === 'administrador';

    // Update Body Class
    if (isAdmin) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }

    // Update Header Info
    document.querySelector('.username').textContent = usuarioLogado.login || 'Usuário';
    document.querySelector('.user-role').textContent = (usuarioLogado.perfil || 'Usuário').toUpperCase();
    document.querySelector('.avatar').textContent = (usuarioLogado.nome || 'U').charAt(0).toUpperCase();

    // Security: Redirect if User is in forbidden section
    const currentSection = document.querySelector('.nav-item.active span')?.textContent.toLowerCase();
    if (!isAdmin && (currentSection === 'agendas' || currentSection === 'usuários')) {
        showSection('relatorios');
    }

    // Hide edit/copy buttons from Agendas if not admin
    if (!isAdmin) {
        renderAgendas(); // Refresh to ensure buttons are hidden by CSS or filtered out
    }
}


function renderUsuarios() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = usuarios.map(u => `
        <tr>
            <td>
                <div style="font-weight: 600;">${u.nome}</div>
                <div style="font-size: 12px; color: var(--gray-600);">${u.login}</div>
            </td>
            <td>
                <span class="role-badge ${u.perfil === 'Administrador' ? 'role-admin' : 'role-viewer'}">
                    ${u.perfil}
                </span>
            </td>
            <td>
                <span class="badge ${u.status === 'Ativo' ? 'badge-success' : 'badge-danger'}" style="font-size: 10px;">
                    ${u.status}
                </span>
            </td>
            <td style="text-align: right;">
                <button class="icon-btn" style="color: var(--gray-500);" onclick="editUsuario(${u.id})"><i class="fas fa-edit"></i></button>
                <button class="icon-btn" style="color: var(--danger);" onclick="excluirUsuario(${u.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function editUsuario(id) {
    editingUsuarioId = id;
    openModal('addUser');
}

async function excluirUsuario(id) {
    if (id === 1) return showToast('O administrador padrão não pode ser excluído', 'error');
    if (id === usuarioLogado.id) return showToast('Você não pode excluir a si mesmo', 'error');

    if (confirm('Deseja excluir este usuário permanentemente da nuvem?')) {
        const userToDelete = usuarios.find(u => u.id === id);
        if (userToDelete) {
            // Mostrar estado de carregamento se possível ou apenas aguardar
            const suceso = await salvarDadosCloud('deleteUsuario', { id: userToDelete.id });
            if (suceso) {
                usuarios = usuarios.filter(u => u.id !== id);
                renderUsuarios();
                showToast('Usuário removido com sucesso');
            }
        }
    }
}

async function excluirAgenda(id) {
    if (confirm('Deseja excluir esta agenda permanentemente da nuvem? TODOS OS AGENDAMENTOS vinculados também serão apagados!')) {
        const agendaToDelete = agendas.find(a => a.id === id);
        if (agendaToDelete) {
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
        }
    }
}

function showSection(section) {
    const mainHeader = document.querySelector('.main-content > .header');
    const mainTitle = document.querySelector('.main-content > .content-section > h2');
    const agendasSection = document.getElementById('agendasSection');
    const relatoriosSection = document.getElementById('relatoriosSection');
    const usuariosSection = document.getElementById('usuariosSection');
    const dashboardSection = document.getElementById('dashboardSection');

    // Security check: Only admins can access 'agendas', 'usuarios' and 'dashboard'
    const profile = (usuarioLogado.perfil || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isAdmin = profile === 'administrador';

    if (!isAdmin && (section === 'agendas' || section === 'usuarios' || section === 'dashboard')) {
        section = 'relatorios';
    }

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes(`'${section}'`)) {
            item.classList.add('active');
        }
    });

    // Hide all content containers
    if (mainHeader) mainHeader.style.display = 'none';
    if (mainTitle) mainTitle.style.display = 'none';
    if (agendasSection) agendasSection.style.display = 'none';
    if (relatoriosSection) relatoriosSection.style.display = 'none';
    if (usuariosSection) usuariosSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'none';

    if (section === 'relatorios') {
        if (relatoriosSection) {
            relatoriosSection.style.display = 'block';
            renderRelatoriosView();
        }
    } else if (section === 'usuarios') {
        if (usuariosSection) {
            usuariosSection.style.display = 'block';
            renderUsuarios();
        }
    } else if (section === 'dashboard') {
        if (dashboardSection) {
            dashboardSection.style.display = 'block';
            renderDashboard();
        }
    } else {
        // 'agendas'
        if (mainHeader) mainHeader.style.display = 'block';
        if (mainTitle) mainTitle.style.display = 'flex';
        if (agendasSection) agendasSection.style.display = 'block';
        renderAgendas();
    }
}

let dashboardCharts = [];
function renderDashboard() {
    const container = document.getElementById('dashboardContent');
    if (!container) return;

    // Filter active agendas
    const activeAgendas = agendas.filter(a => a.status === 'active');

    // Limpar gráficos antigos
    dashboardCharts.forEach(chart => {
        if (chart) chart.destroy();
    });
    dashboardCharts = [];
    container.innerHTML = ''; // Limpa o container

    if (activeAgendas.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Nenhuma agenda ativa</h3></div>';
        return;
    }

    activeAgendas.forEach(agenda => {
        // Calcular valores baseados nos campos solicitados
        const reservados = agendamentos.filter(ag => ag.agendaId == agenda.id).length;
        const livres = calcularHorariosLivres(agenda, reservados);

        // Criar card para o gráfico
        const card = document.createElement('div');
        card.className = 'form-group dashboard-card';
        card.style.cssText = 'background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;';

        const title = document.createElement('h3');
        title.textContent = agenda.nome;
        title.style.cssText = 'font-size: 14px; margin-bottom: 25px; color: #333; text-transform: uppercase; font-family: sans-serif; letter-spacing: 0.5px;';
        card.appendChild(title);

        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = 'height: 250px; position: relative; width: 100%; display: flex; justify-content: center;';

        const canvas = document.createElement('canvas');
        canvas.id = `chart_${agenda.id}`;
        canvasContainer.appendChild(canvas);

        card.appendChild(canvasContainer);
        container.appendChild(card);

        // Estilizar a legenda de acordo com a foto
        const chart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['Número de Horários Livres', 'Agendamentos Reservados'],
                datasets: [{
                    data: [livres, reservados],
                    backgroundColor: ['#00c2a8', '#4285f4'], // Laranja e Azul parecidos com o print
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%', // Faz o anel ser perfeitamente como na foto
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true, // Bolinhas / Quadrados mais elegantes
                            pointStyle: 'rect',
                            boxWidth: 15,
                            boxHeight: 15,
                            padding: 20,
                            font: {
                                size: 13,
                                family: 'sans-serif',
                                weight: 'bold'
                            },
                        },
                        onClick: null, // Evitar ocultar os dados clicando
                        generateLabels: (chart) => {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            original.forEach((label, index) => {
                                // Força a cor do texto igual a do background
                                label.fontColor = index === 0 ? '#00c2a8' : '#4285f4';
                            });
                            return original;
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return ` ${context.label}: ${context.raw}`; // Espaço antes para parecer com a foto
                            }
                        }
                    }
                }
            }
        });

        dashboardCharts.push(chart);
    });
}

function renderRelatoriosView() {
    const container = document.getElementById('reportAgendasList');
    if (!container) return;

    const activeAgendas = agendas.filter(a => a.status === 'active');

    if (activeAgendas.length === 0) {
        container.innerHTML = '<p>Nenhuma agenda ativa encontrada.</p>';
        return;
    }

    container.innerHTML = `
        <label class="checkbox-item" style="border-bottom: 2px solid #eee; margin-bottom: 10px; font-weight: bold;">
            <input type="checkbox" id="selectAllReports" onchange="toggleAllReports(this)">
            Selecionar Todas
        </label>
    ` + activeAgendas.map(a => `
        <label class="checkbox-item">
            <input type="checkbox" class="report-agenda-cb" value="${a.id}" checked>
            <span>${a.nome}</span>
        </label>
    `).join('');
}

function toggleAllReports(source) {
    document.querySelectorAll('.report-agenda-cb').forEach(cb => cb.checked = source.checked);
}

async function gerarRelatorioPDF() {
    // Show Loading Overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.querySelector('p').textContent = 'Sincronizando dados...';
        loadingOverlay.style.display = 'flex';
    }

    // Invalidate local cache explicitly to force cloud fetch
    localStorage.removeItem('appDataCache');
    localStorage.removeItem('appDataCacheTime');

    // Await strictly the fresh load
    await carregarDados();

    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }

    // Get filter values
    const dataIni = document.getElementById('reportDataIni').value;
    const dataFim = document.getElementById('reportDataFim').value;

    // Get selected IDs
    const checkboxes = document.querySelectorAll('.report-agenda-cb:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (selectedIds.length === 0) {
        showToast('Selecione pelo menos uma agenda', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Relatório de Agendamentos", 14, 20);

    doc.setFontSize(10);
    const now = new Date();
    doc.text(`Gerado em: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 14, 26);

    // Period display
    if (dataIni || dataFim) {
        const pIni = dataIni ? dataIni.split('-').reverse().join('/') : 'Início';
        const pFim = dataFim ? dataFim.split('-').reverse().join('/') : 'Fim';
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Período: ${pIni} até ${pFim}`, 14, 32);
        y = 40;
    } else {
        y = 35;
    }

    // Filter agendas
    const agendasRelatorio = agendas.filter(a => selectedIds.includes(a.id));

    agendasRelatorio.forEach(agenda => {
        doc.setFontSize(14);
        doc.setFillColor(200, 200, 200);
        doc.rect(14, y, 180, 8, 'F');
        doc.text(`Agenda: ${agenda.nome}`, 16, y + 6);
        y += 15;

        // Filter and Sort appointments
        let appts = agendamentos.filter(a => {
            const matchAgenda = a.agendaId == agenda.id;
            const matchIni = !dataIni || a.data >= dataIni;
            const matchFim = !dataFim || a.data <= dataFim;
            return matchAgenda && matchIni && matchFim;
        });

        // Sort: Date ASC -> Time ASC
        appts.sort((a, b) => {
            if (a.data < b.data) return -1;
            if (a.data > b.data) return 1;
            // Same date, check time
            if (a.horario < b.horario) return -1;
            if (a.horario > b.horario) return 1;
            return 0;
        });

        if (appts.length === 0) {
            doc.setFontSize(12);
            doc.text("Nenhum agendamento.", 14, y);
            y += 10;
        } else {
            // Create a single table for all appointments in this agenda
            const tableData = appts.map(a => [
                limparData(a.data),
                limparHorario(a.horario),
                a.nome,
                a.servico,
                a.telefone
            ]);

            doc.autoTable({
                startY: y,
                head: [['Data', 'Horário', 'Nome', 'Serviço', 'Telefone']],
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: [0, 191, 165], // Teal matching the photo
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 3
                },
                margin: { left: 14 }
            });

            y = doc.lastAutoTable.finalY + 10;
        }
        y += 5;
        if (y > 270) { doc.addPage(); y = 20; }
    });

    doc.save("relatorio_agendamentos.pdf");
    showToast('Relatório gerado com sucesso!');
}



function limparData(val) {
    if (!val) return "-";
    const s = String(val);
    if (s.includes('T')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0') + '/' + d.getFullYear();
        }
    }
    const parts = s.split('-');
    if (parts.length < 3) return s;
    return `${parts[2]}/${parts[1]}/${parts[0]}`.substring(0, 10);
}

function limparHorario(val) {
    if (!val) return "-";
    const s = String(val);
    if (s.includes('T')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            // Rounding for potential historical seconds (e.g. 12:06:28)
            const rounded = new Date(d.getTime() + 30000);
            return rounded.getHours().toString().padStart(2, '0') + ':' + rounded.getMinutes().toString().padStart(2, '0');
        }
    }
    return s.substring(0, 5);
}

function limparDataISO(val) {
    if (!val) return "";
    const s = String(val).trim();

    // Normalizar DD/MM/YYYY para YYYY-MM-DD
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const parts = s.split('/');
        return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
    }

    if (s.includes('T')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
        }
    }
    return s;
}

function limparHoraISO(val) {
    if (!val) return "";
    const s = String(val);
    if (s.includes('T')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            const rounded = new Date(d.getTime() + 30000);
            return rounded.getHours().toString().padStart(2, '0') + ':' + rounded.getMinutes().toString().padStart(2, '0');
        }
    }
    return s.substring(0, 5);
}

function mascaraTelefone(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 11) value = value.substring(0, 11);
    if (value.length <= 10) {
        input.value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
    } else {
        input.value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
    }
}

function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, "");
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    input.value = v;
}

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 2000);
}
function imprimirRecibo() {
    const body = document.querySelector(".recibo-body");
    const now = new Date();
    if (body) body.setAttribute("data-date", now.toLocaleDateString() + " " + now.toLocaleTimeString());
    window.print();
}


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
// --- FUNﾃ�髭S LEGAIS ---
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
    const overlay = document.getElementById("modalOverlay");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    
    if (overlay && title && body) {
        title.innerText = titulo;
        body.innerHTML = html;
        
        // Usa classe active para visibilidade (padronizado)
        overlay.classList.add("active");
        overlay.style.display = ""; // Limpa display inline
        
        // Esconde bot�s do footer (Salvar/Cancelar) em modais informativos
        const footer = overlay.querySelector(".modal-footer");
        if (footer) footer.style.display = "none";
    }
}


// Sobrescrever closeModal para garantir que o footer volte ao normal
const originalCloseModal = window.closeModal;
window.closeModal = function() {
    const footer = document.querySelector(".modal-overlay .modal-footer");
    if (footer) footer.style.display = "flex"; // Restaura o footer para outros modais
    
    if (typeof originalCloseModal === "function") {
        originalCloseModal();
    }
    
    // Garante o fechamento resetando a classe active e o display inline
    const overlay = document.getElementById("modalOverlay");
    if (overlay) {
        overlay.classList.remove("active");
        overlay.style.display = "none";
    }
};
