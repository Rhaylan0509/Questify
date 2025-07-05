import os
import json
import subprocess
import shutil
from flask import Flask, request, jsonify, send_from_directory, send_file

# Configuração do Flask
# A configuração 'static_folder' e 'static_url_path' faz com que o Flask sirva
# arquivos da pasta raiz, facilitando servir o index.html e as outras pastas.
app = Flask(__name__, static_folder='.', static_url_path='')

# --- Carregamento do Banco de Questões ---
# O banco de questões será lido do arquivo database.json (versão JSON do seu .js)
QUESTOES_POR_ID = {}
try:
    with open('database.json', 'r', encoding='utf-8') as f:
        banco_de_questoes = json.load(f)
        QUESTOES_POR_ID = {q['id']: q for q in banco_de_questoes}
    print("Banco de questões carregado com sucesso.")
except FileNotFoundError:
    print("AVISO: O arquivo 'database.json' não foi encontrado. A API de PDF não funcionará.")
except json.JSONDecodeError:
    print("ERRO: Falha ao decodificar o arquivo 'database.json'. Verifique se o formato é válido.")


# --- Funções Auxiliares para Geração de PDF ---

def check_latex_installed():
    """Verifica se o comando 'pdflatex' está disponível no sistema."""
    return shutil.which('pdflatex') is not None

def create_latex_document(title, question_ids):
    """
    Gera o conteúdo de um arquivo .tex a partir dos IDs das questões.
    Esta função constrói uma string que representa um documento LaTeX completo.
    """
    questions = [QUESTOES_POR_ID.get(qid) for qid in question_ids if qid in QUESTOES_POR_ID]
    
    # Preâmbulo do documento LaTeX, com pacotes essenciais.
    preamble = r"""
\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{amsfonts}
\usepackage{amssymb}
\usepackage{graphicx}
\usepackage[margin=2cm]{geometry}
\usepackage{hyperref}
\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,      
    urlcolor=cyan,
}

\begin{document}
\begin{center}
    \huge \textbf{%s}
\end{center}
\vspace{5mm}
\hrule
\vspace{5mm}
\begin{enumerate}
    """ % title.replace('_', ' ').title()

    # Itera sobre cada questão para construir seu conteúdo em LaTeX
    question_content = ""
    for q in questions:
        # Escapa caracteres especiais do LaTeX no enunciado
        enunciado = q.get('enunciado', 'Enunciado não encontrado.').replace('#', r'\#').replace('%', r'\%').replace('$', '$')
        
        question_content += f"\\item {enunciado}\n"
        
        # Adiciona a imagem se a URL estiver presente
        if q.get('imagemURL'):
            # Nota: Para um sistema real, seria necessário baixar a imagem primeiro.
            # Aqui, estamos apenas colocando um placeholder.
            # Ex: question_content += f"\\includegraphics[width=0.8\\textwidth]{{{q['imagemURL']}}}"
            question_content += f"\\textit{{[Imagem da questão: {q.get('imagemURL')}]}} \\\\\n"

        # Adiciona as opções/alternativas
        if 'opcoes' in q:
            question_content += r"\begin{itemize}" + "\n"
            for opt in q['opcoes']:
                texto_opcao = opt.get('texto', '').replace('#', r'\#').replace('%', r'\%').replace('$', '$')
                question_content += f"    \\item {texto_opcao}\n"
            question_content += r"\\end{itemize}" + "\n"
        
        question_content += r"\vspace{8mm}" # Adiciona um espaço vertical entre as questões

    # Final do documento LaTeX
    footer = r"""
\end{enumerate}
\end{document}
    """
    
    return preamble + question_content + footer


# --- Rotas da Aplicação (Endpoints) ---

@app.route('/')
def serve_index():
    """Serve a página principal do site."""
    return send_from_directory('.', 'index.html')

@app.route('/api/gerar-pdf', methods=['POST'])
def handle_generate_pdf():
    """
    Endpoint da API para receber os dados, gerar e retornar o PDF.
    Este é o núcleo da funcionalidade do backend.
    """
    # 1. Verifica se o LaTeX está instalado no sistema
    if not check_latex_installed():
        error_msg = "ERRO NO SERVIDOR: A instalação do LaTeX (pdflatex) não foi encontrada."
        print(error_msg)
        return jsonify({"error": error_msg, "solution": "Instale uma distribuição LaTeX (MiKTeX, TeX Live, MacTeX) e garanta que 'pdflatex' esteja no PATH do sistema."}), 500

    # 2. Obtém os dados da requisição enviada pelo JavaScript
    try:
        data = request.json
        title = data.get('titulo', 'Lista_de_Exercicios')
        question_ids = data.get('ids_questoes', [])
    except Exception as e:
        return jsonify({"error": f"Erro ao processar os dados da requisição: {e}"}), 400

    if not question_ids:
        return jsonify({"error": "Nenhum ID de questão foi fornecido."}), 400

    # 3. Define nomes e caminhos para os arquivos temporários
    temp_dir = os.path.join(os.getcwd(), 'temp_pdf_files')
    os.makedirs(temp_dir, exist_ok=True)
    
    # Cria um nome de arquivo único para evitar conflitos
    unique_id = str(hash(tuple(sorted(question_ids))) & 0xffffffff)
    base_filename = f"lista_{unique_id}"
    tex_filepath = os.path.join(temp_dir, f"{base_filename}.tex")
    pdf_filepath = os.path.join(temp_dir, f"{base_filename}.pdf")

    try:
        # 4. Cria e escreve o conteúdo no arquivo .tex
        latex_content = create_latex_document(title, question_ids)
        with open(tex_filepath, 'w', encoding='utf-8') as f:
            f.write(latex_content)

        # 5. Executa o comando 'pdflatex' para compilar o .tex em PDF
        # O comando é executado duas vezes para garantir que referências (como numeração) sejam resolvidas.
        for _ in range(2):
            process = subprocess.run(
                ['pdflatex', '-output-directory', temp_dir, '-interaction=nonstopmode', tex_filepath],
                capture_output=True, text=True, encoding='utf-8'
            )
        
        # 6. Verifica se a compilação foi bem-sucedida
        if not os.path.exists(pdf_filepath):
            print("ERRO na compilação do LaTeX. Log:")
            print(process.stdout)
            return jsonify({"error": "Falha ao compilar o documento LaTeX. Verifique o log do servidor para mais detalhes.", "log": process.stdout}), 500

        # 7. Envia o arquivo PDF gerado para o usuário
        return send_file(pdf_filepath, as_attachment=True, download_name=f"{title.replace(' ', '_')}.pdf")

    except Exception as e:
        return jsonify({"error": f"Um erro inesperado ocorreu no servidor: {e}"}), 500
    finally:
        # 8. Limpa os arquivos temporários após o envio (ou em caso de erro)
        # O shutil.rmtree remove o diretório e todo o seu conteúdo.
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


if __name__ == '__main__':
    # Executa a aplicação. 'host="0.0.0.0"' torna o servidor acessível na sua rede local.
    print("Servidor Flask iniciando...")
    print("Acesse em http://127.0.0.1:5000 ou http://[SEU_IP_LOCAL]:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
