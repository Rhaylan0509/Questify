const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

let browserInstance;

// Inicia o navegador em segundo plano para reutilização
async function startBrowser() {
    try {
        console.log('Iniciando instância do navegador Puppeteer...');
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });
        console.log('Navegador Puppeteer iniciado com sucesso.');
    } catch (error) {
        console.error('Falha ao iniciar o Puppeteer:', error);
    }
}

app.use(express.json({ limit: '10mb' }));
// Serve o index.html a partir da pasta raiz
app.use(express.static(path.join(__dirname, '..')));

app.post('/generate-pdf', async (req, res) => {
    console.log('Recebida requisição para gerar PDF...');
    if (!browserInstance) {
        return res.status(503).send({ message: 'Servidor ainda está inicializando, por favor tente novamente em um momento.' });
    }

    const { questoes, tituloProva } = req.body;
    const htmlContent = getHtmlForPuppeteer(questoes, tituloProva);
    
    let page;
    try {
        page = await browserInstance.newPage();
        
        // Define o conteúdo HTML na nova aba do navegador invisível
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        console.log('Página renderizada, gerando PDF...');
        
        // Gera o PDF a partir da página renderizada
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=prova_gerada.pdf');
        res.send(pdfBuffer);
        
        console.log('PDF enviado com sucesso.');

    } catch (error) {
        console.error('Erro ao gerar o PDF:', error);
        res.status(500).send({ message: 'Ocorreu um erro no servidor ao gerar o PDF.', error: error.message });
    } finally {
        if (page) await page.close();
    }
});

// Inicia o servidor e o navegador
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    startBrowser();
});

// Função que monta a string HTML final para o Puppeteer
function getHtmlForPuppeteer(questoes, titulo) {
    let numeroQuestao = 1;
    let questoesHtml = '';
    questoes.forEach((item) => {
        questoesHtml += `
            <div class="questao-container">
                <strong>${numeroQuestao++})</strong><hr style="margin: 5px 0;">
                <p>${item.texto}</p>
                <div class="alternativas-container">
                    ${item.alternativas.map(alt => `<p class="alternativa">${alt}</p>`).join('')}
                </div>
            </div>`;
    });

    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>${titulo}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
            <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"></script>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; }
                .page-header { font-size: 16pt; text-align: center; margin-bottom: 15mm; }
                .page-content-container { column-count: 2; column-gap: 15mm; }
                .questao-container { border: 1px solid #ccc; padding: 10px; border-radius: 8px; margin-bottom: 10mm; background-color: #f9f9f9; break-inside: avoid; }
                .alternativas-container { margin-top: 8px; }
                .alternativa { margin: 5px 0; }
                .katex { font-size: 1.1em !important; }
            </style>
        </head>
        <body>
            <div class="page-header">${titulo}</div>
            <div class="page-content-container">${questoesHtml}</div>
            <script>
                // Script para renderizar o LaTeX dentro do Puppeteer
                document.addEventListener("DOMContentLoaded", function() {
                    const renderizarLatex = (el) => {
                        if(window.katex) {
                           katex.render(el.innerHTML, el, {
                                throwOnError: false,
                                delimiters: [
                                    {left: "$$", right: "$$", display: true},
                                    {left: "$", right: "$", display: false}
                                ]
                           });
                        }
                    };
                    document.querySelectorAll('.questao-container p').forEach(renderizarLatex);
                });
            </script>
        </body>
        </html>
    `;
}
