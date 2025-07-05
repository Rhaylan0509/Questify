document.addEventListener('DOMContentLoaded', () => {

    let BANCO_DE_QUESTOES = [];
    let listaAtualFiltrada = [];
    let minhasListasSalvas = [];

    // Elementos da UI
    const telaInicial = document.getElementById('tela-inicial');
    const telaConfigurar = document.getElementById('tela-configurar-lista');
    const telaRevisar = document.getElementById('tela-revisar-lista');
    const telaMinhasListas = document.getElementById('tela-minhas-listas');
    const btnIniciarCriacao = document.getElementById('btn-iniciar-criacao');
    const btnVerListas = document.getElementById('btn-ver-listas');
    const btnIrParaCriacao = document.getElementById('btn-ir-para-criacao');
    const btnMontarLista = document.getElementById('btn-montar-lista');
    const btnVoltarConfig = document.getElementById('btn-voltar-config');
    const btnSalvarLista = document.getElementById('btn-salvar-lista');
    const btnVoltarDeConfig = document.getElementById('btn-voltar-de-config');
    const btnVoltarDeListas = document.getElementById('btn-voltar-de-listas');
    const filtroMateriaContainer = document.getElementById('filtro-materia-container');
    const filtroDificuldadeContainer = document.getElementById('filtro-dificuldade-container');
    const filtroTopicosContainer = document.getElementById('filtro-topicos-container');
    const containerListasSalvas = document.getElementById('container-listas-salvas');
    const nomeListaInput = document.getElementById('nome-lista-input');
    const containerListaRevisao = document.getElementById('container-lista-revisao');
    const modalGabarito = document.getElementById('modal-gabarito');
    const modalTitulo = document.getElementById('modal-titulo');
    const modalCorpo = document.getElementById('modal-corpo');
    const btnFecharModal = document.getElementById('btn-fechar-modal');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Funções de Loading e Navegação ---
    function showLoading(message = "A gerar o seu PDF, por favor aguarde...") {
        loadingOverlay.querySelector('p').textContent = message;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    function mudarDeTela(telaAlvo) {
        [telaInicial, telaConfigurar, telaRevisar, telaMinhasListas].forEach(tela => tela.classList.add('hidden'));
        if (telaAlvo === 'inicial') telaInicial.classList.remove('hidden');
        else if (telaAlvo === 'configurar') telaConfigurar.classList.remove('hidden');
        else if (telaAlvo === 'revisar') telaRevisar.classList.remove('hidden');
        else if (telaAlvo === 'minhas-listas') {
            renderizarMinhasListas();
            telaMinhasListas.classList.remove('hidden');
        }
    }

    // --- Funções de Manipulação de Dados ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function renderizarEquacoes(elemento) {
        return new Promise((resolve) => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise(elemento ? [elemento] : undefined).then(resolve).catch(err => {
                    console.error('Erro ao renderizar MathJax:', err);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    function carregarListasDoLocalStorage() {
        const listas = localStorage.getItem('minhasListasDeExercicios');
        minhasListasSalvas = listas ? JSON.parse(listas) : [];
    }

    function salvarListasNoLocalStorage() {
        localStorage.setItem('minhasListasDeExercicios', JSON.stringify(minhasListasSalvas));
    }

    // --- Funções de Filtro e Montagem da Lista ---
    function popularFiltroMaterias() {
        const materias = [...new Set(BANCO_DE_QUESTOES.map(q => q.materia))];
        filtroMateriaContainer.innerHTML = '';
        materias.sort().forEach(materia => {
            filtroMateriaContainer.innerHTML += `<label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="materia" value="${materia}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>${materia}</span></label>`;
        });
        filtroMateriaContainer.querySelectorAll('input[name="materia"]').forEach(checkbox => {
            checkbox.addEventListener('change', atualizarFiltroTopicos);
        });
    }

    function popularFiltroDificuldade() {
        const niveis = [{ id: 'facil', label: 'Fácil' }, { id: 'medio', label: 'Médio' }, { id: 'dificil', label: 'Difícil' }];
        filtroDificuldadeContainer.innerHTML = '';
        niveis.forEach(nivel => {
            filtroDificuldadeContainer.innerHTML += `<label class="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="dificuldade" value="${nivel.id}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>${nivel.label}</span></label>`;
        });
    }

    function atualizarFiltroTopicos() {
        const materiasSelecionadas = [...document.querySelectorAll('input[name="materia"]:checked')].map(el => el.value);
        filtroTopicosContainer.innerHTML = '';
        if (materiasSelecionadas.length === 0) {
            filtroTopicosContainer.innerHTML = '<p class="text-sm text-gray-500">Selecione uma ou mais disciplinas primeiro.</p>';
            return;
        }
        const arvoreDeTopicos = new Map();
        const questoesDasMaterias = BANCO_DE_QUESTOES.filter(q => materiasSelecionadas.includes(q.materia));
        questoesDasMaterias.forEach(q => {
            if (q.topicos && q.topicos.length > 0) {
                const topicoPai = q.topicos[0];
                if (!arvoreDeTopicos.has(topicoPai)) arvoreDeTopicos.set(topicoPai, new Set());
                if (q.topicos[1]) arvoreDeTopicos.get(topicoPai).add(q.topicos[1]);
            }
        });
        for (const [topico, subtópicos] of arvoreDeTopicos.entries()) {
            let htmlTopico = `<div class="topico-pai mt-2"><label class="flex items-center space-x-2 font-semibold cursor-pointer"><input type="checkbox" name="topico" value="${topico}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>${topico}</span></label></div>`;
            if (subtópicos.size > 0) {
                let htmlSubtopicos = '<div class="subtopicos ml-5 mt-1 space-y-1">';
                subtópicos.forEach(sub => {
                    htmlSubtopicos += `<label class="flex items-center space-x-2 font-normal cursor-pointer"><input type="checkbox" name="subtopico" data-pai="${topico}" value="${sub}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span>${sub}</span></label>`;
                });
                htmlSubtopicos += '</div>';
                htmlTopico = htmlTopico.replace('</div>', htmlSubtopicos + '</div>');
            }
            filtroTopicosContainer.innerHTML += htmlTopico;
        }
    }

    function montarLista() {
        const materias = [...document.querySelectorAll('input[name="materia"]:checked')].map(el => el.value);
        const dificuldades = [...document.querySelectorAll('input[name="dificuldade"]:checked')].map(el => el.value);
        const topicos = [...document.querySelectorAll('input[name="topico"]:checked, input[name="subtopico"]:checked')].map(el => el.value);
        if (materias.length === 0 || dificuldades.length === 0 || topicos.length === 0) {
            alert('Por favor, selecione ao menos uma matéria, um nível de dificuldade e um assunto.');
            return;
        }
        let questoesFiltradas = BANCO_DE_QUESTOES.filter(q => {
            return materias.includes(q.materia) && dificuldades.includes(q.nivel) && topicos.some(ts => q.topicos.includes(ts));
        });
        if (questoesFiltradas.length === 0) {
            alert('Nenhuma questão foi encontrada com os filtros selecionados.');
            return;
        }
        const gruposPorMateria = questoesFiltradas.reduce((acc, questao) => {
            if (!acc[questao.materia]) acc[questao.materia] = [];
            acc[questao.materia].push(questao);
            return acc;
        }, {});
        listaAtualFiltrada = [];
        for (const materia of materias) {
            if (gruposPorMateria[materia]) {
                listaAtualFiltrada.push(...shuffleArray(gruposPorMateria[materia]));
            }
        }
        renderizarListaParaRevisao();
        mudarDeTela('revisar');
    }

    // --- Funções de Manipulação de Listas Salvas ---
    function salvarListaAtual() {
        const nomeDaLista = nomeListaInput.value.trim();
        if (!nomeDaLista) {
            alert('Por favor, dê um nome à sua lista antes de guardar.');
            return;
        }
        minhasListasSalvas.push({ id: Date.now(), nome: nomeDaLista, dataCriacao: new Date().toLocaleDateString('pt-PT'), idsDasQuestoes: listaAtualFiltrada.map(q => q.id) });
        salvarListasNoLocalStorage();
        alert('Lista guardada com sucesso!');
        nomeListaInput.value = '';
        mudarDeTela('minhas-listas');
    }

    function deletarLista(listaId) {
        if (confirm('Tem a certeza que deseja apagar esta lista? Esta ação não pode ser desfeita.')) {
            minhasListasSalvas = minhasListasSalvas.filter(lista => lista.id !== listaId);
            salvarListasNoLocalStorage();
            renderizarMinhasListas();
        }
    }

    // --- Funções de Renderização ---
    async function renderizarListaParaRevisao() {
        let htmlParaRenderizar = '';
        listaAtualFiltrada.forEach(questao => {
            const imagem = questao.imagemURL ? `<img src="${questao.imagemURL}" class="mt-2 rounded-md max-w-full">` : '';
            let alternativasHtml = '<ul class="mt-2 space-y-1 list-none text-gray-700">';
            questao.opcoes.forEach((alt, index) => {
                alternativasHtml += `<li>${String.fromCharCode(65 + index)}) ${alt.texto}</li>`;
            });
            alternativasHtml += '</ul>';
            const instituicaoHtml = questao.instituicao ? `<span class="font-normal text-gray-500">(${questao.instituicao})</span>` : '';
            htmlParaRenderizar += `<div class="bg-gray-50 p-4 rounded-lg border border-gray-200"><p class="text-sm font-semibold text-blue-600">${questao.topicos.join(' &rarr; ')} ${instituicaoHtml}</p><p class="mt-2 text-gray-800 whitespace-pre-wrap">${questao.enunciado}</p>${imagem}${alternativasHtml}</div>`;
        });
        containerListaRevisao.innerHTML = htmlParaRenderizar;
        await renderizarEquacoes(containerListaRevisao);
    }

    function renderizarMinhasListas() {
        containerListasSalvas.innerHTML = '';
        if (minhasListasSalvas.length === 0) {
            containerListasSalvas.innerHTML = '<p class="text-center text-gray-500">Ainda não guardou nenhuma lista.</p>';
            return;
        }
        minhasListasSalvas.slice().reverse().forEach(lista => {
            const listaCard = document.createElement('div');
            listaCard.className = 'bg-white p-4 rounded-lg shadow-md flex justify-between items-center flex-wrap gap-2';
            listaCard.innerHTML = `<div class="flex-grow"><h3 class="text-lg font-bold text-gray-800">${lista.nome}</h3><p class="text-sm text-gray-500">Guardada em: ${lista.dataCriacao} - ${lista.idsDasQuestoes.length} questões</p></div><div class="flex space-x-2 flex-shrink-0"><button data-id="${lista.id}" class="btn-gabarito bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-3 rounded-lg text-sm">Gabarito</button><button data-id="${lista.id}" class="btn-baixar-pdf bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg text-sm">Baixar PDF</button><button data-id="${lista.id}" class="btn-deletar-lista bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-3 rounded-lg text-sm">Apagar</button></div>`;
            containerListasSalvas.appendChild(listaCard);
        });
    }

    // --- Funções de Ação (PDF, Gabarito) ---
    async function baixarPdfDeListaSalva(listaId) {
        const lista = minhasListasSalvas.find(l => l.id === listaId);
        if (!lista) return;

        showLoading("A contactar o servidor para gerar o seu PDF...");

        try {
            // Faz a chamada para a API no backend Python
            const response = await fetch('/api/gerar-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: lista.nome,
                    ids_questoes: lista.idsDasQuestoes
                })
            });

            // Se a resposta não for OK (ex: erro 500 ou 400), trata o erro
            if (!response.ok) {
                const errorData = await response.json(); // Tenta ler o corpo do erro como JSON
                console.error('Erro do servidor:', errorData);
                throw new Error(errorData.error || `Erro ${response.status} do servidor.`);
            }

            // Se a resposta for OK, o corpo é o arquivo PDF (blob)
            const pdfBlob = await response.blob();
            
            // Cria uma URL temporária para o blob e simula o clique para download
            const url = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = (lista.nome ? lista.nome.replace(/[^a-z0-9]/gi, '_') : 'lista_de_questoes') + '.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            alert("Ocorreu um erro ao gerar o PDF: " + error.message);
        } finally {
            hideLoading();
        }
    }

    async function mostrarGabarito(listaId) {
        const lista = minhasListasSalvas.find(l => l.id === listaId);
        if (!lista) return;
        const questoesDaLista = lista.idsDasQuestoes.map(id => BANCO_DE_QUESTOES.find(q => q.id === id)).filter(Boolean);
        modalTitulo.textContent = `Gabarito: ${lista.nome}`;
        let gabaritoHtml = '<ol class="list-decimal list-inside space-y-1">';
        questoesDaLista.forEach((q, index) => {
            const letraResposta = String.fromCharCode(65 + q.opcoes.findIndex(opt => opt.correta));
            gabaritoHtml += `<li>Questão ${index + 1}: <span class="font-bold">${letraResposta}</span></li>`;
        });
        gabaritoHtml += '</ol>';
        modalCorpo.innerHTML = gabaritoHtml;
        modalGabarito.classList.remove('hidden');
        await renderizarEquacoes(modalCorpo);
    }

    // --- Função de Inicialização ---
    async function inicializarApp() {
        try {
            // Carrega o banco de dados JSON
            const response = await fetch('/database.json');
            BANCO_DE_QUESTOES = await response.json();

            carregarListasDoLocalStorage();
            
            // Adiciona os event listeners
            btnIniciarCriacao.addEventListener('click', () => mudarDeTela('configurar'));
            btnVerListas.addEventListener('click', () => mudarDeTela('minhas-listas'));
            btnIrParaCriacao.addEventListener('click', () => mudarDeTela('configurar'));
            btnVoltarDeConfig.addEventListener('click', () => mudarDeTela('inicial'));
            btnVoltarDeListas.addEventListener('click', () => mudarDeTela('inicial'));
            btnVoltarConfig.addEventListener('click', () => mudarDeTela('configurar'));
            btnMontarLista.addEventListener('click', montarLista);
            btnSalvarLista.addEventListener('click', salvarListaAtual);

            containerListasSalvas.addEventListener('click', (event) => {
                const target = event.target.closest('button');
                if (!target) return;
                const listaId = Number(target.dataset.id);
                if (target.classList.contains('btn-baixar-pdf')) baixarPdfDeListaSalva(listaId);
                else if (target.classList.contains('btn-gabarito')) mostrarGabarito(listaId);
                else if (target.classList.contains('btn-deletar-lista')) deletarLista(listaId);
            });

            btnFecharModal.addEventListener('click', () => modalGabarito.classList.add('hidden'));
            modalGabarito.addEventListener('click', (event) => {
                if (event.target === modalGabarito) modalGabarito.classList.add('hidden');
            });

            // Popula os filtros iniciais
            popularFiltroMaterias();
            popularFiltroDificuldade();
            mudarDeTela('inicial');

        } catch (error) {
            console.error("Erro fatal ao inicializar a aplicação:", error);
            document.body.innerHTML = `<div class="text-center p-8 text-red-500"><h1>Erro ao carregar o banco de questões.</h1><p>Verifique o console para mais detalhes.</p></div>`;
        }
    }

    inicializarApp();
});
