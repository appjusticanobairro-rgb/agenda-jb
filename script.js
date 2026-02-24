const API_URL = 'https://script.google.com/macros/s/AKfycbzCecQK6mQfT5VITQMiyGU3qJkhWjr-8wdItrLJhyI_eUW9xRxwpdBhDWAlOK3ib26Jrg/exec';

/**
 * PHASE 1: SYSTEM ARCHITECTURE
 * Centralized State, DOM Caching, and Core Modules
 */

// Centralized Application State
const State = {
    agendas: [],
    servicosDisponiveis: [],
    enderecosDisponiveis: [],
    agendamentos: [],
    usuarios: [],
    usuarioLogado: JSON.parse(localStorage.getItem('usuarioLogado')) || null,
    editingAgendaId: null,
    editingUsuarioId: null,
    agendamentoData: {},

    // Defaults
    USUARIOS_DEFAULT: [
        { id: 1, nome: 'Edson', login: 'edson.justicanobairro', senha: 'admin', perfil: 'Administrador', status: 'Ativo' }
    ],
    DEFAULT_SERVICES: [
        { nome: "01 - Alimentos (pensão alimentícia)", duracao: 60 },
        { nome: "23 - RG", duracao: 15 },
        { nome: "20 - Coleta de Exame de DNA", duracao: 30 }
    ],
    DEFAULT_ADDRESS: ["Av. Pres. Kennedy, n.º 900, Bairro Centro, Telêmaco Borba"]
};

// DOM Elements Cache (for performance optimization)
const Dom = {
    cache: {},
    get(id) {
        if (!this.cache[id]) {
            this.cache[id] = document.getElementById(id);
        }
        return this.cache[id];
    },
    resetCache() { this.cache = {}; }
};

/**
 * WEB API MODULE
 * Handles all communication with the Google Apps Script backend
 */
const AppAPI = {
    async fetchData() {
        console.log("Solicitando dados da nuvem...");
        try {
            const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`);
            const data = await response.json();

            State.agendas = (data.agendas || []).map(a => ({
                ...a,
                dataInicial: limparDataISO(a.dataInicial),
                ultimaData: limparDataISO(a.ultimaData),
                atendimentoInicial: limparDataISO(a.atendimentoInicial),
                atendimentoFinal: limparDataISO(a.atendimentoFinal)
            }));

            State.agendamentos = (data.agendamentos || []).map(a => ({
                ...a,
                data: limparDataISO(a.data),
                horario: limparHoraISO(a.horario)
            }));

            State.usuarios = data.usuarios || [];
            State.servicosDisponiveis = (data.servicos?.length > 0) ? data.servicos : State.DEFAULT_SERVICES;
            State.enderecosDisponiveis = (data.enderecos?.length > 0) ? data.enderecos : State.DEFAULT_ADDRESS;

            console.log(`Dados carregados: Agendas(${State.agendas.length}), Usuarios(${State.usuarios.length})`);

            // Auto-seed logic
            if (State.usuarios.length === 0) {
                for (const u of State.USUARIOS_DEFAULT) await this.saveData('saveUsuario', u);
                State.usuarios = [...State.USUARIOS_DEFAULT];
            }
            if (!data.servicos?.length) await this.saveData('saveServicos', State.servicosDisponiveis);
            if (!data.enderecos?.length) await this.saveData('saveEnderecos', State.enderecosDisponiveis);

            return true;
        } catch (error) {
            console.error("Erro API:", error);
            showToast("Erro ao conectar com o banco de dados.", "error");
            return false;
        }
    },

    async saveData(action, data) {
        console.log(`Enviando ${action}...`);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action, data })
            });
            const result = await response.json();

            if (result.status === 'success') {
                showToast('Dados sincronizados!', 'success');
                return true;
            }
            showToast(`Erro: ${result.error || 'Falha'}`, 'error');
            return false;
        } catch (error) {
            console.error("Erro POST:", error);
            Utils.showToast("Erro de conexão.", "error");
            return false;
        }
    }
};

/**
 * UTILS MODULE
 * Helper functions for formatting, sanitization, and UI feedback
 */
const Utils = {
    showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<span>${msg}</span>`;
        Dom.get('toastContainer').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },

    showLoading() {
        const overlay = Dom.get('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
    },

    hideLoading() {
        const overlay = Dom.get('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    limparDataISO(val) {
        if (!val) return "";
        const s = String(val).trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
            const parts = s.split('/');
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        if (s.includes('T')) {
            const d = new Date(val);
            return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : "";
        }
        return s;
    },

    limparHoraISO(val) {
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
    },

    formatDateBR(val) {
        if (!val) return "---";
        const s = String(val).trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
        const datePart = s.includes('T') ? s.split('T')[0] : s;
        return datePart.includes('-') ? datePart.split('-').reverse().join('/') : s;
    },

    mascaraTelefone(input) {
        let value = input.value.replace(/\D/g, "");
        if (value.length > 11) value = value.substring(0, 11);
        input.value = value.length <= 10
            ? value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "")
            : value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
    },

    mascaraCPF(input) {
        let v = input.value.replace(/\D/g, "").substring(0, 11);
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        input.value = v;
    }
};

/**
 * APP UI MODULE
 * Controls routing, security, and global UI states
 */
const AppUI = {
    init() {
        console.log("Iniciando AppUI...");
        this.verificarRota();
        window.addEventListener('hashchange', () => this.verificarRota());
        this.attachGlobalEvents();
    },

    attachGlobalEvents() {
        const loginFields = ['loginUser', 'loginPass'];
        loginFields.forEach(id => {
            const field = Dom.get(id);
            if (field) field.addEventListener('keydown', (e) => e.key === 'Enter' && AdminUI.realizarLogin());
        });
    },

    verificarRota() {
        const hash = window.location.hash;
        console.log("Rota:", hash);

        // Public Routes (Slug)
        if (hash && hash.length > 1) {
            const slugRaw = hash.startsWith('#/') ? hash.substring(2) : hash.substring(1);
            const slug = decodeURIComponent(slugRaw).trim().toLowerCase();

            if (slug && !["", "/", "index.html"].includes(slug)) {
                const agendaFound = State.agendas.find(a => a.slug.toLowerCase() === slug);
                if (agendaFound) {
                    PublicUI.mostrarPaginaAgendamento(agendaFound);
                } else {
                    PublicUI.mostrarPaginaDesativada("Agenda não encontrada");
                }
                return;
            }
        }

        // Admin Routes
        if (!State.usuarioLogado) {
            this.showLogin();
        } else {
            AdminUI.mostrarAdmin();
        }
    },

    showLogin() {
        document.body.classList.add('login-active', 'no-header');
        if (Dom.get('appContainer')) Dom.get('appContainer').style.display = 'none';
        if (Dom.get('adminPage')) Dom.get('adminPage').style.display = 'none';
        if (Dom.get('loginSection')) Dom.get('loginSection').style.display = 'flex';
    },

    closeModal(event) {
        if (event && event.target !== Dom.get('modalOverlay')) return;
        Dom.get('modalOverlay').classList.remove('active');
        State.editingAgendaId = null;
        State.editingUsuarioId = null;
    }
};

// Data Store
// These are now managed by the State object
// let agendas = [];
// let servicosDisponiveis = [];
// let enderecosDisponiveis = [];
// let agendamentos = [];
// let usuarios = [];
// let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

// Defaults para migração
// const USUARIOS_DEFAULT = [
//     {
//         id: 1,
//         nome: 'Edson',
//         login: 'edson.justicanobairro',
//         senha: 'admin',
//         perfil: 'Administrador',
//         status: 'Ativo'
//     }
// ];

// Defaults para migração
// const defaultServices = [
//     { nome: "01 - Alimentos (pensão alimentícia)", duracao: 60 },
//     { nome: "23 - RG", duracao: 15 },
//     { nome: "20 - Coleta de Exame de DNA", duracao: 30 }
// ];

// let editingAgendaId = null; // This is now State.editingAgendaId
// let editingUsuarioId = null; // State for user editing // This is now State.editingUsuarioId
let currentStep = 1;
// let agendamentoData = {}; // This is now State.agendamentoData

// Carregar dados da Nuvem (Google Sheets)
// async function carregarDados() {
//     console.log("Solicitando dados da nuvem...");
//     try {
//         const response = await fetch(`${API_URL}?action=getData&t=${Date.now()}`);
//         const data = await response.json();

//         State.agendas = (data.agendas || []).map(a => ({
//             ...a,
//             dataInicial: Utils.limparDataISO(a.dataInicial),
//             ultimaData: Utils.limparDataISO(a.ultimaData),
//             atendimentoInicial: Utils.limparDataISO(a.atendimentoInicial),
//             atendimentoFinal: Utils.limparDataISO(a.atendimentoFinal)
//         }));
//         State.agendamentos = (data.agendamentos || []).map(a => ({
//             ...a,
//             data: Utils.limparDataISO(a.data),
//             horario: Utils.limparHoraISO(a.horario)
//         }));
//         State.usuarios = data.usuarios || [];

//         // Servicos e Endereços: usar defaults se vazios
//         State.servicosDisponiveis = (data.servicos && data.servicos.length > 0) ? data.servicos : State.DEFAULT_SERVICES;
//         State.enderecosDisponiveis = (data.enderecos && data.enderecos.length > 0) ? data.enderecos : State.DEFAULT_ADDRESS;

//         console.log("Dados carregados da nuvem.");
//         console.log(`Agendas: ${State.agendas.length}, Usuarios: ${State.usuarios.length}, Servicos: ${State.servicosDisponiveis.length}`);

//         // Auto-seed: Se a planilha está vazia, popular com dados iniciais
//         if (State.usuarios.length === 0) {
//             console.log("Nenhum usuário na nuvem. Criando admin padrão...");
//             for (const u of State.USUARIOS_DEFAULT) {
//                 await salvarDadosCloud('saveUsuario', u);
//             }
//             State.usuarios = [...State.USUARIOS_DEFAULT];
//         }
//         if (!data.servicos || data.servicos.length === 0) {
//             console.log("Sem serviços na nuvem. Enviando defaults...");
//             await salvarDadosCloud('saveServicos', State.DEFAULT_SERVICES);
//         }
//         if (!data.enderecos || data.enderecos.length === 0) {
//             console.log("Sem endereços na nuvem. Enviando default...");
//             await salvarDadosCloud('saveEnderecos', State.enderecosDisponiveis);
//         }

//         // Sessão do usuário local
//         State.usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

//     } catch (error) {
//         console.error("Erro ao carregar dados da nuvem:", error);
//         Utils.showToast("Erro ao conectar com o banco de dados. Verifique sua conexão.", "error");
//     }
// }

// Salvar dados na Nuvem (Google Sheets via Apps Script)
// async function salvarDadosCloud(action, data) {
//     try {
//         console.log(`Enviando ação '${action}' para a nuvem...`);
//         const response = await fetch(API_URL, {
//             method: 'POST',
//             headers: { 'Content-Type': 'text/plain;charset=utf-8' },
//             body: JSON.stringify({ action, data }),
//             redirect: 'follow'
//         });
//         const result = await response.json();
//         console.log("Resposta da nuvem:", result);

//         if (result.status === 'success') {
//             Utils.showToast('Dados sincronizados!', 'success');
//             return true;
//         } else {
//             const erroMsg = result.error || 'Falha no processamento';
//             Utils.showToast(`Erro na nuvem: ${erroMsg}`, 'error');
//             return false;
//         }
//     } catch (error) {
//         console.error("Erro ao salvar dados na nuvem:", error);
//         Utils.showToast("Erro de conexão. Verifique sua rede.", "error");
//         return false;
//     }
// }

document.addEventListener('DOMContentLoaded', async () => {
    await AppAPI.fetchData();
    AppUI.init();
});

// Sincronização via hashchange (navegação entre páginas)
window.addEventListener('hashchange', () => verificarRota());

/**
 * ADMIN UI MODULE
 * Controls the Dashboard, User Management, and Agenda CRUD
 */
const AdminUI = {
    async realizarLogin() {
        console.log("Tentando login...");
        const user = Dom.get('loginUser').value.trim().toLowerCase();
        const pass = Dom.get('loginPass').value.trim();

        if (!user || !pass) return Utils.showToast('Preencha usuário e senha', 'error');

        const userFound = State.usuarios.find(u => String(u.login || '').toLowerCase().trim() === user);

        if (userFound && String(userFound.senha) === String(pass)) {
            if (userFound.status !== 'Ativo') return Utils.showToast('Usuário inativo', 'error');

            State.usuarioLogado = userFound;
            localStorage.setItem('usuarioLogado', JSON.stringify(userFound));
            Utils.showToast(`Bem-vindo, ${userFound.nome}!`);
            AppUI.verificarRota();
        } else {
            Utils.showToast('Credenciais inválidas', 'error');
        }
    },

    realizarLogout() {
        State.usuarioLogado = null;
        localStorage.removeItem('usuarioLogado');
        window.location.hash = '';
        AppAPI.fetchData(); // Refresh on logout
        AppUI.verificarRota();
    },

    mostrarAdmin() {
        if (!State.usuarioLogado) return AppUI.showLogin();

        document.body.classList.remove('no-header', 'login-active');
        Dom.get('appContainer').style.display = 'block';
        Dom.get('loginSection').style.display = 'none';
        Dom.get('adminPage').style.display = 'flex';

        // Redirect non-admins to reports
        const profile = (State.usuarioLogado.perfil || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (profile !== 'administrador') {
            this.showSection('relatorios');
        }

        this.renderAgendas();
        this.aplicarPermissoes();
    },

    showSection(id) {
        ['agendas', 'relatorios', 'usuarios'].forEach(s => {
            const sec = Dom.get(`${s}Section`);
            if (sec) sec.style.display = (s === id) ? 'block' : 'none';
        });

        // Toggle Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(item => {
            const label = item.querySelector('span')?.textContent.toLowerCase();
            item.classList.toggle('active', label && label.includes(id));
        });

        if (id === 'usuarios') this.renderUsuarios();
        if (id === 'relatorios') this.prepararRelatorios();
    },

    aplicarPermissoes() {
        const profile = (State.usuarioLogado.perfil || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isAdmin = profile === 'administrador';
        document.body.classList.toggle('is-admin', isAdmin);

        // Update user profile UI
        const usernameEl = Dom.get('username');
        const roleEl = Dom.get('user-role');
        const avatarEl = Dom.get('avatar');

        if (avatarEl) avatarEl.textContent = State.usuarioLogado.nome.charAt(0).toUpperCase();
    },

    openModal(type) {
        const modal = Dom.get('modalOverlay');
        const body = Dom.get('modalBody');
        const title = Dom.get('modalTitle');
        const footer = document.querySelector('.modal-footer');

        modal.classList.add('active');
        let footerHtml = '';

        if (type === 'add') {
            title.textContent = State.editingAgendaId ? 'Adicionar/Editar Agenda' : 'Nova Agenda';
            body.innerHTML = this.getAgendaForm();
            footerHtml = `
                <button class="btn btn-cancel" onclick="AppUI.closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="AdminUI.saveAgenda()">
                    <i class="fas fa-save"></i> Salvar
                </button>
            `;
        } else if (type === 'addUser') {
            title.textContent = State.editingUsuarioId ? 'Editar Usuário' : 'Novo Usuário';
            body.innerHTML = this.getUsuarioForm();
            footerHtml = `
                <button class="btn btn-cancel" onclick="AppUI.closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="AdminUI.saveUsuario()">
                    <i class="fas fa-save"></i> ${State.editingUsuarioId ? 'Salvar Alterações' : 'Salvar Usuário'}
                </button>
            `;
            if (State.editingUsuarioId) {
                const user = State.usuarios.find(u => u.id === State.editingUsuarioId);
                if (user) {
                    setTimeout(() => {
                        if (Dom.get('userName')) Dom.get('userName').value = user.nome;
                        if (Dom.get('userLogin')) Dom.get('userLogin').value = user.login;
                        if (Dom.get('userPerfil')) Dom.get('userPerfil').value = user.perfil;
                        if (Dom.get('userStatus')) Dom.get('userStatus').value = user.status;
                        if (Dom.get('userPass')) Dom.get('userPass').value = user.senha || '';
                    }, 10);
                }
            }
        } else if (type === 'servicos') {
            title.textContent = 'Gerenciar Serviços e Duração';
            body.innerHTML = this.getServicosForm();
            footerHtml = `<button class="btn btn-secondary" onclick="AppUI.closeModal()">Fechar</button>`;
        } else if (type === 'enderecos') {
            title.textContent = 'Endereços de Atendimento';
            body.innerHTML = this.getEnderecosForm();
            footerHtml = `<button class="btn btn-secondary" onclick="AppUI.closeModal()">Fechar</button>`;
        }

        if (footer) footer.innerHTML = footerHtml;
    },

    getAgendaForm() {
        const agenda = State.editingAgendaId ? State.agendas.find(a => a.id === State.editingAgendaId) : {};
        const mapDias = { 'seg': 'Segunda', 'ter': 'Terça', 'qua': 'Quarta', 'qui': 'Quinta', 'sex': 'Sexta', 'sab': 'Sábado', 'dom': 'Domingo' };

        return `
            <div class="form-row">
                <div class="form-group"><label>Nome</label><input class="form-control" id="formNome" value="${agenda.nome || ''}" oninput="AdminUI.gerarSlug()"></div>
                <div class="form-group"><label>Slug</label><input class="form-control" id="formSlug" value="${agenda.slug || ''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Vigência inicial</label><input type="date" class="form-control" id="formDataIni" value="${Utils.limparDataISO(agenda.dataInicial)}"></div>
                <div class="form-group"><label>Vigência Final</label><input type="date" class="form-control" id="formDataFim" value="${Utils.limparDataISO(agenda.ultimaData)}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Data de atendimento inicial</label><input type="date" class="form-control" id="formAtendIni" value="${Utils.limparDataISO(agenda.atendimentoInicial)}"></div>
                <div class="form-group"><label>Data de atendimento Final</label><input type="date" class="form-control" id="formAtendFim" value="${Utils.limparDataISO(agenda.atendimentoFinal)}"></div>
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
                    ${State.enderecosDisponiveis.map(e => `<option value="${e}">`).join('')}
                </datalist>
            </div>
            <div class="horario-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <div class="horario-title" style="margin-bottom: 20px; color: #333; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-clock"></i> Horários
                </div>
                ${['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map(d => {
            let h = agenda.horarioAtendimento?.[d] || { ativo: false };
            let slots = h.slots || [];
            if (h.ativo && slots.length === 0) {
                slots = [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '16:00' }];
            }
            return `
                    <div class="horario-row-container" id="container_${d}" style="margin-bottom: 15px; display: flex; align-items: flex-start; gap: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px; width: 120px; padding-top: 8px;">
                            <input type="checkbox" id="h_${d}_a" ${h.ativo ? 'checked' : ''} onchange="AdminUI.toggleDia('${d}')"> 
                            <label for="h_${d}_a" style="margin: 0; font-weight: 500; cursor: pointer; color: #555; font-size: 14px;">${mapDias[d]}</label>
                        </div>
                        <div id="slots_${d}" style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
                            ${slots.map((s) => this.getSlotRowHtml(d, s.inicio, s.fim)).join('')}
                        </div>
                    </div>`;
        }).join('')}
            </div>
            <div class="form-group" style="margin-top: 20px;">
                <label>Serviços desta Agenda</label>
                <div class="services-selection">
                    ${State.servicosDisponiveis
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
    },

    getSlotRowHtml(d, inicio = '', fim = '') {
        return `
            <div class="slot-row" style="display: flex; align-items: center; gap: 15px;">
                <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
                    <input type="time" class="form-control slot-start" value="${inicio}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
                </div>
                <div style="flex: 1; background: white; padding: 5px 10px; border: 1px solid #dee2e6; border-radius: 6px; display: flex; align-items: center;">
                    <input type="time" class="form-control slot-end" value="${fim}" style="border: none; height: 30px; box-shadow: none; background: transparent; width: 100%;">
                </div>
                <div style="display: flex; gap: 5px;">
                    <button type="button" class="icon-btn" onclick="AdminUI.addSlot('${d}')" style="color: #00bfa5; background: #e0f2f1; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-plus"></i></button>
                    <button type="button" class="icon-btn" onclick="this.closest('.slot-row').remove()" style="color: #ef5350; background: #ffebee; border-radius: 4px; width: 32px; height: 32px; display: grid; place-items: center;"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    },

    toggleDia(d) {
        const active = Dom.get(`h_${d}_a`).checked;
        const container = Dom.get(`slots_${d}`);
        if (active && container.children.length === 0) {
            this.addSlot(d, '09:00', '12:00');
            this.addSlot(d, '13:00', '16:00');
        }
    },

    addSlot(d, inicio = '', fim = '') {
        const container = Dom.get(`slots_${d}`);
        const div = document.createElement('div');
        div.innerHTML = this.getSlotRowHtml(d, inicio, fim);
        container.appendChild(div.firstElementChild);
    },

    async saveAgenda() {
        const nome = Dom.get('formNome').value.trim();
        const slug = Dom.get('formSlug').value.trim();
        if (!nome || !slug) return Utils.showToast('Preencha nome e slug', 'error');

        const servicos = Array.from(document.querySelectorAll('.servico-cb:checked')).map(cb => cb.value);
        const horarioAtendimento = {};
        ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].forEach(d => {
            const slotsDivs = document.querySelectorAll(`#slots_${d} .slot-row`);
            const slots = Array.from(slotsDivs).map(row => ({
                inicio: row.querySelector('.slot-start').value,
                fim: row.querySelector('.slot-end').value
            })).filter(s => s.inicio && s.fim);

            horarioAtendimento[d] = {
                ativo: Dom.get(`h_${d}_a`).checked,
                slots: slots
            };
        });

        const newAgenda = {
            id: State.editingAgendaId || Date.now(),
            nome, slug,
            dataInicial: Dom.get('formDataIni').value,
            ultimaData: Dom.get('formDataFim').value,
            atendimentoInicial: Dom.get('formAtendIni').value,
            atendimentoFinal: Dom.get('formAtendFim').value,
            senha: Dom.get('formSenha').value,
            status: Dom.get('formStatus').value,
            endereco: Dom.get('formEndereco').value,
            maxAgendamentosHorario: parseInt(Dom.get('formMaxAgendamentos').value) || 6,
            servicos, horarioAtendimento
        };

        Utils.showLoading();
        const success = await AppAPI.saveData('saveAgenda', newAgenda);
        Utils.hideLoading();

        if (success) {
            if (State.editingAgendaId) {
                const idx = State.agendas.findIndex(a => a.id === State.editingAgendaId);
                State.agendas[idx] = newAgenda;
            } else {
                State.agendas.push(newAgenda);
            }
            this.renderAgendas();
            AppUI.closeModal();
            Utils.showToast('Agenda salva!');
        }
    },

    gerarSlug() {
        if (State.editingAgendaId) return;
        Dom.get('formSlug').value = Dom.get('formNome').value.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    },

    editAgenda(id) {
        State.editingAgendaId = id;
        this.openModal('add');
    },

    async deleteAgenda(id) {
        if (!confirm('Deseja excluir esta agenda permanentemente?')) return;
        Utils.showLoading();
        const success = await AppAPI.saveData('deleteAgenda', { id });
        Utils.hideLoading();
        if (success) {
            State.agendas = State.agendas.filter(a => a.id !== id);
            this.renderAgendas();
            Utils.showToast('Agenda excluída!');
        }
    },

    // Services Management
    getServicosForm() {
        const sorted = [...State.servicosDisponiveis].sort((a, b) => (parseInt(a.nome) || 999) - (parseInt(b.nome) || 999));
        return `
            <div class="form-row" style="align-items: flex-end; gap: 10px; margin-bottom: 20px;">
                <div class="form-group" style="flex: 2;">
                    <label>Novo Serviço</label>
                    <input id="newServName" class="form-control" placeholder="Nome do Serviço">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Duração</label>
                    <select id="newServDur" class="form-control">
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">1 hora</option>
                    </select>
                </div>
                <button class="btn btn-primary" onclick="AdminUI.addServico()" style="margin-bottom: 5px;">ADD</button>
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
                ${sorted.map((s, i) => `
                    <div class="list-item" style="display:flex; justify-content:space-between; padding: 10px; border-bottom: 1px solid #eee;">
                        <span>${s.nome} (${s.duracao} min)</span>
                        <button class="icon-btn color-danger" onclick="AdminUI.delServico(${i})"><i class="fas fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    async addServico() {
        const nome = Dom.get('newServName').value.trim();
        const duracao = parseInt(Dom.get('newServDur').value);
        if (!nome) return;
        const newList = [...State.servicosDisponiveis, { nome, duracao }];
        if (await AppAPI.saveData('saveServicos', newList)) {
            State.servicosDisponiveis = newList;
            this.openModal('servicos');
        }
    },

    async delServico(index) {
        if (!confirm('Excluir serviço?')) return;
        const newList = State.servicosDisponiveis.filter((_, i) => i !== index);
        if (await AppAPI.saveData('saveServicos', newList)) {
            State.servicosDisponiveis = newList;
            this.openModal('servicos');
        }
    },

    // Address Management
    getEnderecosForm() {
        return `
            <div class="form-group">
                <label>Novo Endereço Completo</label>
                <textarea id="newEndFull" class="form-control" placeholder="Rua, Número, Bairro, Cidade - UF" rows="3"></textarea>
                <button class="btn btn-primary" onclick="AdminUI.addEndereco()" style="width: 100%; margin-top: 10px;">Salvar Endereço</button>
            </div>
            <hr>
            <div style="max-height: 250px; overflow-y: auto;">
                ${State.enderecosDisponiveis.map((e, i) => `
                    <div class="list-item" style="display:flex; justify-content:space-between; padding: 10px; border-bottom: 1px solid #eee;">
                        <span style="font-size: 13px;">${e}</span>
                        <button class="icon-btn color-danger" onclick="AdminUI.delEndereco(${i})"><i class="fas fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    async addEndereco() {
        const end = Dom.get('newEndFull').value.trim();
        if (!end) return;
        const newList = [...State.enderecosDisponiveis, end];
        if (await AppAPI.saveData('saveEnderecos', newList)) {
            State.enderecosDisponiveis = newList;
            this.openModal('enderecos');
        }
    },

    async delEndereco(index) {
        if (!confirm('Excluir endereço?')) return;
        const newList = State.enderecosDisponiveis.filter((_, i) => i !== index);
        if (await AppAPI.saveData('saveEnderecos', newList)) {
            State.enderecosDisponiveis = newList;
            this.openModal('enderecos');
        }
    },

    // User Management
    getUsuarioForm() {
        return `
            <div class="form-grid">
                <div class="form-group"><label>Nome</label><input type="text" id="userName" class="form-control"></div>
                <div class="form-group"><label>Login</label><input type="text" id="userLogin" class="form-control"></div>
                <div class="form-group"><label>Senha</label><input type="password" id="userPass" class="form-control" placeholder="Vazio para manter"></div>
                <div class="form-group"><label>Perfil</label>
                    <select id="userPerfil" class="form-control">
                        <option value="Administrador">Administrador</option>
                        <option value="Usuário">Usuário (Relatórios)</option>
                    </select>
                </div>
                <div class="form-group"><label>Status</label>
                    <select id="userStatus" class="form-control">
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                    </select>
                </div>
            </div>
        `;
    },

    async saveUsuario() {
        const nome = Dom.get('userName').value.trim();
        const login = Dom.get('userLogin').value.trim();
        const senha = Dom.get('userPass').value.trim();
        const perfil = Dom.get('userPerfil').value;
        const status = Dom.get('userStatus').value;

        if (!nome || !login) return Utils.showToast('Preencha nome e login', 'error');

        const userData = State.editingUsuarioId
            ? { ...State.usuarios.find(u => u.id === State.editingUsuarioId), nome, login, perfil, status }
            : { id: Date.now(), nome, login, senha, perfil, status };

        if (State.editingUsuarioId && senha) userData.senha = senha;

        Utils.showLoading();
        if (await AppAPI.saveData('saveUsuario', userData)) {
            if (State.editingUsuarioId) {
                const idx = State.usuarios.findIndex(u => u.id === State.editingUsuarioId);
                State.usuarios[idx] = userData;
            } else {
                State.usuarios.push(userData);
            }
            this.renderUsuarios();
            AppUI.closeModal();
            Utils.showToast('Usuário salvo!');
        }
        Utils.hideLoading();
    },

    async deleteUser(id) {
        if (id === 1) return Utils.showToast('Admin não pode ser excluído', 'error');
        if (!confirm('Excluir usuário?')) return;
        Utils.showLoading();
        if (await AppAPI.saveData('deleteUsuario', { id })) {
            State.usuarios = State.usuarios.filter(u => u.id !== id);
            this.renderUsuarios();
            Utils.showToast('Usuário removido!');
        }
        Utils.hideLoading();
    },

    editUser(id) {
        State.editingUsuarioId = id;
        this.openModal('addUser');
    },

    // Reports & Sections
    showSection(id) {
        const sections = ['agendas', 'usuarios', 'relatorios'];
        sections.forEach(s => {
            const sec = Dom.get(`${s}Section`);
            if (sec) sec.style.display = (s === id) ? 'block' : 'none';
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            const label = item.querySelector('span')?.textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            item.classList.toggle('active', label && label.includes(id));
        });

        if (id === 'usuarios') this.renderUsuarios();
        if (id === 'relatorios') this.prepararRelatorios();
        if (id === 'agendas') this.renderAgendas();
    },

    prepararRelatorios() {
        const container = Dom.get('reportAgendasList');
        if (!container) return;
        const actives = State.agendas.filter(a => a.status === 'active');
        container.innerHTML = `
            <label class="checkbox-item" style="border-bottom: 2px solid #eee; margin-bottom: 10px; font-weight: bold;">
                <input type="checkbox" id="selectAllReports" onchange="AdminUI.toggleAllReports(this)"> Selecionar Todas
            </label>
            ${actives.map(a => `<label class="checkbox-item"><input type="checkbox" class="report-agenda-cb" value="${a.id}" checked> ${a.nome}</label>`).join('')}
        `;
    },

    toggleAllReports(source) {
        document.querySelectorAll('.report-agenda-cb').forEach(cb => cb.checked = source.checked);
    },

    async gerarRelatorioPDF() {
        const dataIni = Dom.get('reportDataIni').value;
        const dataFim = Dom.get('reportDataFim').value;
        const selectedIds = Array.from(document.querySelectorAll('.report-agenda-cb:checked')).map(cb => parseInt(cb.value));

        if (selectedIds.length === 0) return Utils.showToast('Selecione uma agenda', 'error');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(18);
        doc.text("Relatório de Agendamentos", 14, y);
        y += 10;
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, y);
        y += 10;

        State.agendas.filter(a => selectedIds.includes(a.id)).forEach(agenda => {
            doc.setFontSize(14);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, y, 180, 8, 'F');
            doc.text(`Agenda: ${agenda.nome}`, 16, y + 6);
            y += 15;

            const appts = State.agendamentos.filter(a =>
                a.agendaId == agenda.id && (!dataIni || a.data >= dataIni) && (!dataFim || a.data <= dataFim)
            ).sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));

            if (appts.length === 0) {
                doc.text("Nenhum agendamento encontrado.", 16, y);
                y += 10;
            } else {
                doc.autoTable({
                    startY: y,
                    head: [['Data', 'Hora', 'Nome', 'Serviço', 'Telefone']],
                    body: appts.map(a => [Utils.formatDateBR(a.data), a.horario, a.nome, a.servico, a.telefone]),
                    theme: 'grid',
                    headStyles: { fillColor: [0, 191, 165] },
                    margin: { left: 14 }
                });
                y = doc.lastAutoTable.finalY + 10;
            }
            if (y > 270) { doc.addPage(); y = 20; }
        });

        doc.save("relatorio_agendamentos.pdf");
        Utils.showToast('PDF Gerado!');
    },

    toggleFilters() {
        Dom.get('filtersSection').classList.toggle('active');
    },

    applyFilters() {
        const query = Dom.get('agendaSearch').value.toLowerCase().trim();
        const status = Dom.get('filterStatus').value;
        const tipo = Dom.get('filterTipo').value;
        const local = Dom.get('filterLocal').value.toLowerCase().trim();
        const servico = Dom.get('filterServico').value.toLowerCase().trim();

        const filtered = State.agendas.filter(agenda => {
            const matchSearch = !query || agenda.nome.toLowerCase().includes(query);
            const matchStatus = !status || agenda.status === status;
            const matchTipo = !tipo || (agenda.tipo || '').toLowerCase() === tipo;
            const matchLocal = !local || (agenda.endereco || '').toLowerCase().includes(local);
            const matchServico = !servico || (agenda.servicos || []).some(s => s.toLowerCase().includes(servico));

            return matchSearch && matchStatus && matchTipo && matchLocal && matchServico;
        });

        this.renderAgendas(filtered);
    },

    renderAgendas(filtered = null) {
        const container = Dom.get('agendasContainer');
        const data = filtered || State.agendas;
        const baseUrl = window.location.href.split('#')[0];

        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>Nenhuma agenda</h3></div>';
            return;
        }

        container.innerHTML = data.map(agenda => {
            const link = `${baseUrl}#/${agenda.slug}`;
            const dataInicio = Utils.formatDateBR(agenda.dataInicial);
            const dataFim = Utils.formatDateBR(agenda.ultimaData);

            return `
                <div class="card ${agenda.status === 'inactive' ? 'inactive' : ''}">
                    <!-- Card Content Header -->
                    <div class="card-header-info">
                        <div class="status-indicator">
                             <span class="dot"></span>
                             ${agenda.status === 'active' ? 'Ativa' : 'Desativada'}
                        </div>
                        <div class="slug-badge" title="Slug amigável">
                            <i class="fas fa-link"></i> /${agenda.slug}
                        </div>
                    </div>

                    <div class="card-body">
                        <h3>${agenda.nome}</h3>
                        <p class="service-type"><i class="fas fa-bullseye"></i> ${agenda.tipo === 'presencial' ? 'Presencial' : 'Online'}</p>
                        
                        <div class="info-row">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${agenda.endereco || 'Endereço não definido'}</span>
                        </div>
                        
                        <div class="info-row">
                            <i class="fas fa-clock"></i>
                            <span>${dataInicio} até ${dataFim}</span>
                        </div>

                        <div class="services-list">
                             ${(agenda.servicos || []).map(s => `<span>${s}</span>`).join('')}
                        </div>
                    </div>

                    <div class="card-footer">
                        <button class="btn btn-sm btn-outline" onclick="AdminUI.editAgenda(${agenda.id})">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-sm btn-outline btn-delete admin-only" onclick="AdminUI.deleteAgenda(${agenda.id})">
                             <i class="fas fa-trash"></i> Excluir
                        </button>
                        <a href="${link}" target="_blank" class="btn btn-sm btn-primary">
                             <i class="fas fa-external-link-alt"></i> Abrir Link
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderUsuarios() {
        const tbody = Dom.get('usersTableBody');
        tbody.innerHTML = State.usuarios.map(user => `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="avatar-sm">${user.nome.charAt(0)}</div>
                        <div class="user-details">
                            <strong>${user.nome}</strong>
                            <span>${user.login}</span>
                        </div>
                    </div>
                </td>
                <td><span class="role-badge role-${user.perfil.toLowerCase() === 'administrador' ? 'admin' : 'viewer'}">${user.perfil}</span></td>
                <td><span class="status-badge ${user.status.toLowerCase() === 'ativo' ? 'status-active' : 'status-inactive'}">${user.status}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="AdminUI.editUser(${user.id})" title="Editar"><i class="fas fa-edit"></i></button>
                    ${user.id !== 1 ? `<button class="btn-icon color-danger" onclick="AdminUI.deleteUser(${user.id})" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    }
};

/**
 * PUBLIC UI MODULE
 * Controls the customer-facing booking portal
 */
const PublicUI = {
    mostrarPaginaDesativada(titulo, mensagem) {
        document.body.classList.add('no-header');
        Dom.get('adminPage').style.display = 'none';
        Dom.get('loginSection').style.display = 'none';

        const page = Dom.get('desativadaPage');
        if (titulo) page.querySelector('h2').textContent = titulo;
        if (mensagem) page.querySelector('p').textContent = mensagem;

        page.classList.add('active');
        Dom.get('agendamentoPage').classList.remove('active');
        Dom.get('confirmacaoPage').classList.remove('active');
    },

    mostrarPaginaAgendamento(agenda) {
        console.log("Portal Público:", agenda.nome);
        document.body.classList.add('no-header');
        Dom.get('adminPage').style.display = 'none';
        Dom.get('loginSection').style.display = 'none';

        Dom.get('desativadaPage').classList.remove('active');
        Dom.get('agendamentoPage').classList.add('active');
        Dom.get('confirmacaoPage').classList.remove('active');

        // Setup the specific agenda in the select and lock it
        const select = Dom.get('publicAgendaSelect');
        if (select) {
            select.innerHTML = `<option value="${agenda.id}" selected>${agenda.nome}</option>`;
            select.disabled = true;
        }

        Dom.get('publicAgendaNome').textContent = agenda.nome;

        // Handle password protection
        const rowSenha = Dom.get('publicSenhaRow');
        const inputSenha = Dom.get('publicSenha');
        const agendaSenha = String(agenda.senha || '').trim();

        if (agendaSenha && agendaSenha.toLowerCase() !== "null") {
            rowSenha.style.display = 'block';
            inputSenha.value = '';
        } else {
            rowSenha.style.display = 'none';
        }

        this.carregarServicosPublic(agenda);
        this.gerarDiasDisponiveis(agenda);
    },

    carregarServicosPublic(agenda) {
        const select = Dom.get('publicServicoSelect');
        select.innerHTML = '<option value="">Selecione um serviço</option>';
        agenda.servicos.forEach(sName => {
            const sObj = State.servicosDisponiveis.find(s => s.nome === sName);
            if (sObj) {
                select.innerHTML += `<option value="${sObj.nome}" data-duracao="${sObj.duracao}">${sObj.nome}</option>`;
            }
        });
    },

    gerarDiasDisponiveis(agenda) {
        const grid = Dom.get('diasGrid');
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let searchWindow = 30;
        if (agenda.atendimentoFinal) {
            const finalAtend = new Date(agenda.atendimentoFinal + 'T12:00:00');
            const diffDays = Math.ceil((finalAtend - hoje) / (1000 * 60 * 60 * 24)) + 1;
            searchWindow = Math.max(30, Math.min(180, diffDays));
        }

        let html = '';
        for (let i = 0; i < searchWindow; i++) {
            const data = new Date(hoje);
            data.setDate(hoje.getDate() + i);
            const dataStr = data.toISOString().split('T')[0];

            if (agenda.atendimentoInicial && dataStr < agenda.atendimentoInicial) continue;
            if (agenda.atendimentoFinal && dataStr > agenda.atendimentoFinal) continue;

            const mapDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
            const diaKey = mapDias[data.getDay()];
            if (!agenda.horarioAtendimento[diaKey]?.ativo) continue;

            html += `
                <div class="dia-btn" onclick="PublicUI.selecionarDia(this, '${dataStr}')" data-data="${dataStr}">
                    <div class="dia-nome">${diasSemana[data.getDay()]}</div>
                    <div class="dia-numero">${data.getDate()}</div>
                </div>
            `;
        }
        grid.innerHTML = html;
    },

    selecionarDia(el, data) {
        document.querySelectorAll('.dia-btn').forEach(btn => btn.classList.remove('selected'));
        el.classList.add('selected');
        State.agendamentoData.data = data;

        const help = Dom.get('dataHelp');
        help.textContent = `Data selecionada: ${Utils.formatDateBR(data)}`;
        help.style.color = 'var(--success)';
        this.gerarHorariosDisponiveis(data);
    },

    gerarHorariosDisponiveis(dataStr) {
        const grid = Dom.get('horariosGrid');
        const agendaId = Dom.get('publicAgendaSelect').value;
        const agenda = State.agendas.find(a => a.id == agendaId);

        const servicoSelect = Dom.get('publicServicoSelect');
        const option = servicoSelect.options[servicoSelect.selectedIndex];
        if (!option.value) {
            grid.innerHTML = '<p class="help-text">Selecione um serviço primeiro.</p>';
            return;
        }

        const duracao = parseInt(option.dataset.duracao) || 30;
        const dataObj = new Date(dataStr + 'T00:00:00');
        const mapDias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaKey = mapDias[dataObj.getDay()];
        const configDia = agenda.horarioAtendimento[diaKey];

        let slots = [];
        const configSlots = configDia.slots || [];
        configSlots.forEach(s => {
            slots = slots.concat(this.gerarSlotsPorDuracao(s.inicio, s.fim, duracao));
        });

        let html = '';
        const max = parseInt(agenda.maxAgendamentosHorario) || 1;

        slots.forEach(horario => {
            const count = State.agendamentos.filter(a =>
                String(a.agendaId) === String(agendaId) && a.data === dataStr && a.horario === horario
            ).length;

            if (count < max) {
                html += `<button class="horario-btn" onclick="PublicUI.selecionarHorario(this, '${horario}')">${horario}</button>`;
            }
        });

        grid.innerHTML = html || '<p>Não há horários disponíveis.</p>';
    },

    gerarSlotsPorDuracao(inicio, fim, duracao) {
        let slots = [];
        let atual = this.converteHoraMinutos(inicio);
        let final = this.converteHoraMinutos(fim);
        while (atual + duracao <= final) {
            slots.push(this.converteMinutosHora(atual));
            atual += duracao;
        }
        return slots;
    },

    converteHoraMinutos(h) { const [hrs, min] = h.split(':').map(Number); return hrs * 60 + min; },
    converteMinutosHora(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },

    selecionarHorario(el, horario) {
        document.querySelectorAll('.horario-btn').forEach(btn => btn.classList.remove('selected'));
        el.classList.add('selected');
        State.agendamentoData.horario = horario;
        Dom.get('horarioHelp').textContent = `Horário: ${horario}`;
    },

    proximoStep() {
        const agendaId = Dom.get('publicAgendaSelect').value;
        const servico = Dom.get('publicServicoSelect').value;
        const agenda = State.agendas.find(a => a.id == agendaId);

        const agendaSenha = String(agenda.senha || '').trim();
        if (agendaSenha && agendaSenha.toLowerCase() !== "null") {
            const input = Dom.get('publicSenha');
            if (!input || input.value.trim() !== agendaSenha) {
                return Utils.showToast('Senha da agenda incorreta!', 'error');
            }
        }

        if (!servico) return Utils.showToast('Selecione um serviço', 'error');
        if (!State.agendamentoData.data) return Utils.showToast('Selecione uma data', 'error');
        if (!State.agendamentoData.horario) return Utils.showToast('Selecione um horário', 'error');

        State.agendamentoData.agendaId = agendaId;
        State.agendamentoData.servico = servico;
        State.agendamentoData.agendaNome = agenda.nome;
        State.agendamentoData.endereco = agenda.endereco;

        Dom.get('step1Content').style.display = 'none';
        Dom.get('step2Content').style.display = 'block';
        Dom.get('step1Indicator').classList.remove('active');
        Dom.get('step2Indicator').classList.add('active');
        Dom.get('btnVoltar').style.display = 'flex';
        Dom.get('btnProximo').style.display = 'none';
        Dom.get('btnConfirmar').style.display = 'flex';

        // Simplificação do forms conforme solicitado anteriormente
        if (Dom.get('publicCPF')) Dom.get('publicCPF').closest('.form-row-single').style.display = 'none';
        if (Dom.get('publicEmail')) Dom.get('publicEmail').closest('.form-row-single').style.display = 'none';
    },

    voltarStep() {
        Dom.get('step1Content').style.display = 'block';
        Dom.get('step2Content').style.display = 'none';
        Dom.get('step1Indicator').classList.add('active');
        Dom.get('step2Indicator').classList.remove('active');
        Dom.get('btnVoltar').style.display = 'none';
        Dom.get('btnProximo').style.display = 'flex';
        Dom.get('btnConfirmar').style.display = 'none';
    },

    async confirmarAgendamento() {
        const nome = Dom.get('publicNome').value.trim();
        const telefone = Dom.get('publicTelefone').value.trim();
        const termos = Dom.get('termosAceite').checked;

        if (!nome) return Utils.showToast('Nome é obrigatório', 'error');
        if (!termos) return Utils.showToast('Aceite os termos', 'error');

        Utils.showLoading();

        // Final capacity check
        const agenda = State.agendas.find(a => a.id == State.agendamentoData.agendaId);
        const count = State.agendamentos.filter(a =>
            String(a.agendaId) === String(agenda.id) &&
            a.data === State.agendamentoData.data &&
            a.horario === State.agendamentoData.horario
        ).length;

        if (count >= (agenda.maxAgendamentosHorario || 1)) {
            Utils.hideLoading();
            Utils.showToast('Horário esgotado!', 'error');
            this.voltarStep();
            this.gerarHorariosDisponiveis(State.agendamentoData.data);
            return;
        }

        State.agendamentoData.nome = nome;
        State.agendamentoData.telefone = telefone || 'Não informado';
        State.agendamentoData.cpf = '-';
        State.agendamentoData.email = '-';
        State.agendamentoData.codigo = Math.random().toString(36).substr(2, 7).toUpperCase();

        const success = await AppAPI.saveData('saveAgendamento', State.agendamentoData);
        Utils.hideLoading();
        if (success) {
            State.agendamentos.push({ ...State.agendamentoData });
            this.mostrarConfirmacao();
        }
    },

    mostrarConfirmacao() {
        Dom.get('agendamentoPage').classList.remove('active');
        Dom.get('confirmacaoPage').classList.add('active');

        Dom.get('confirmCodigo').textContent = State.agendamentoData.codigo;
        Dom.get('confirmAgenda').textContent = State.agendamentoData.agendaNome;
        Dom.get('confirmData').textContent = Utils.formatDateBR(State.agendamentoData.data);
        Dom.get('confirmHorario').textContent = State.agendamentoData.horario;
        Dom.get('confirmServico').textContent = State.agendamentoData.servico;
        Dom.get('confirmNome').textContent = State.agendamentoData.nome;
        Dom.get('confirmTelefone').textContent = State.agendamentoData.telefone;
        Dom.get('confirmEndereco').textContent = State.agendamentoData.endereco;
    },

    novoAgendamento() {
        if (confirm('Deseja iniciar um novo agendamento?')) {
            State.agendamentoData = {};
            window.location.reload();
        }
    },

    async cancelarAgendamento() {
        if (!confirm('Excluir este agendamento permanentemente?')) return;

        Utils.showLoading();
        const success = await AppAPI.saveData('deleteAgendamento', { codigo: State.agendamentoData.codigo });
        Utils.hideLoading();

        if (success) {
            Utils.showToast('Cancelado com sucesso.');
            setTimeout(() => window.location.reload(), 1000);
        }
    },

    imprimirRecibo() {
        const body = document.querySelector(".recibo-body");
        if (body) body.setAttribute("data-date", new Date().toLocaleString());
        window.print();
    }
};

/**
 * INITIALIZATION
 * Start the application after all modules are defined
 */
document.addEventListener('DOMContentLoaded', async () => {
    Utils.showLoading();
    const success = await AppAPI.fetchData();
    Utils.hideLoading();

    if (success) {
        AppUI.init();
    } else {
        Utils.showToast("Falha ao carregar dados. Recarregue a página.", "error");
    }
});
