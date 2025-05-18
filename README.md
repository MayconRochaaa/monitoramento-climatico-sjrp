# Monitoramento Climático - Mesorregião de São José do Rio Preto

![Imagem de Capa do Projeto (Opcional)](./link_para_imagem_de_capa.png) ## 📖 Sobre o Projeto

Este projeto foi desenvolvido como parte do Projeto Integrador do curso de [Nome do Curso] da UNIVESP. O objetivo é fornecer uma plataforma web para o monitoramento de condições climáticas e alertas de eventos extremos (como ondas de calor, chuvas fortes e ventos fortes) para as cidades da mesorregião de São José do Rio Preto, SP. A plataforma visa informar a população em tempo hábil, possibilitando ações preventivas e mitigadoras.

**Links da Aplicação:**
* **Frontend (Aplicação Web):** [https://mayconrochaaa.github.io/monitoramento-climatico-sjrp/](https://mayconrochaaa.github.io/monitoramento-climatico-sjrp/)
* **Backend (API):** [https://monitoramento-climatico-api.onrender.com](https://monitoramento-climatico-api.onrender.com) 

## ✨ Funcionalidades Principais

* Visualização de alertas climáticos em mapa interativo e lista.
* Filtros de alertas por período, cidade e tipo de alerta.
* Exibição das condições meteorológicas atuais para cidades selecionadas.
* Previsão do tempo para os próximos 5 dias.
* Sistema de subscrição de e-mail para receber alertas automaticamente.
* Geração automática de alertas com base em dados da API OpenWeather.
* Envio de e-mails de alerta agrupados por utilizador.

## 🛠️ Tecnologias Utilizadas

**Frontend:**
* HTML5
* CSS3 (Tailwind CSS)
* JavaScript (Vanilla JS)
* Leaflet.js (para mapas interativos)
* Litepicker (para seleção de datas)
* Font Awesome (para ícones)
* Day.js (para manipulação de datas)

**Backend:**
* Node.js
* Express.js
* PostgreSQL (Banco de Dados)
* Axios (para requisições HTTP à API OpenWeather)
* Nodemailer (para envio de e-mails)
* node-cron (para agendamento de tarefas)
* dotenv (para gestão de variáveis de ambiente)

**Plataformas de Deploy:**
* **Frontend:** GitHub Pages
* **Backend & Banco de Dados:** Render.com

**Outras Ferramentas:**
* Git & GitHub (Controlo de versão e repositório)
* DBeaver (Gestão de banco de dados)
* Postman/Insomnia (Teste de API)

## ⚙️ Configuração do Ambiente de Desenvolvimento Local

Para executar este projeto localmente, siga os passos abaixo.

### Pré-requisitos

* Node.js (versão >= 18.x recomendada - verifique a secção `engines` no `backend/package.json`)
* NPM (geralmente vem com o Node.js)
* Uma instância do PostgreSQL a correr localmente ou acessível.
* Uma chave de API válida do [OpenWeatherMap](https://openweathermap.org/api).
* Credenciais de uma conta Gmail (com "senha de aplicativo" se tiver 2FA ativado) para envio de e-mails.

### Backend

1.  **Clone o repositório (se ainda não o fez):**
    ```bash
    git clone https://github.com/MayconRochaaa/monitoramento-climatico-sjrp.git
    cd NOME_DO_SEU_REPOSITORIO/backend ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    * Crie um arquivo `.env` na pasta `backend/` com base no arquivo `.env.example` (se existir) ou com as seguintes variáveis:
        ```env
        OPENWEATHER_API_KEY=SUA_CHAVE_OPENWEATHER
        DB_USER=seu_usuario_postgres_local
        DB_HOST=localhost
        DB_NAME=monitoramento_climatico_db_local
        DB_PASSWORD=sua_senha_postgres_local
        DB_PORT=5432
        EMAIL_USER=seu_email_gmail@gmail.com
        EMAIL_PASS=sua_senha_de_aplicativo_gmail
        PORT=3000
        ```

4.  **Configure o Banco de Dados Local:**
    * Crie a base de dados `monitoramento_climatico_db_local` no seu PostgreSQL.
    * Execute os scripts SQL localizados em [link_para_pasta_sql_se_houver] ou os scripts fornecidos durante o desenvolvimento para criar as tabelas (`cities`, `alert_types`, `users`, `user_city_subscriptions`, `alerts`) e popular os dados iniciais (`cities`, `alert_types`).

5.  **Inicie o servidor backend:**
    ```bash
    npm start
    ```
    O servidor deverá estar a correr em `http://localhost:3000`.

### Frontend

1.  **Abra o arquivo `frontend/index.html`** diretamente no seu navegador.
2.  O `frontend/js/script.js` está configurado para usar `http://localhost:3000/api` quando aberto localmente.

## 🚀 Uso da Aplicação

1.  Acesse o link da aplicação frontend.
2.  Utilize os filtros para visualizar alertas no mapa e na lista.
3.  Selecione uma cidade para ver as condições atuais e a previsão.
4.  Para receber alertas por e-mail, clique em "Inscreva-se", preencha o seu e-mail e selecione as cidades de interesse.

## 🔗 Endpoints da API (Backend)

Uma breve descrição dos principais endpoints (opcional, mas útil):

* `GET /api/cidades`: Retorna a lista de cidades monitoradas.
* `GET /api/tipos-alerta`: Retorna os tipos de alerta definidos.
* `GET /api/alertas?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&cityIds=id1,id2&alertTypeIds=tipo1,tipo2`: Retorna os alertas filtrados.
* `GET /api/weather/current/:cityId`: Retorna as condições meteorológicas atuais para uma cidade.
* `GET /api/weather/forecast/:cityId`: Retorna a previsão do tempo para uma cidade.
* `POST /api/subscribe`: Permite que um utilizador subscreva alertas por e-mail para cidades específicas.
    * Corpo da Requisição (JSON): `{ "email": "user@example.com", "cityIds": ["sjrp", "mirassol"] }`
* `GET /api/trigger-alert-generation`: (Apenas para desenvolvimento/teste) Dispara manualmente a verificação e geração de alertas.

## 👨‍💻 Equipe

* [Flavio Lombardi Ribeiro] - [RA: 23207586]
* [Maycon Vinícius Rodrigues Rocha] - [RA: 23208471]
* [Natã Kesley Stellari Gonçalves] - [RA: 2104467]
* [Renan Barcelos Feliciano] - [RA: 23213509]
* Tutor(a): [Glaucia Jardim Pissinelli]

## 📄 Licença

Este projeto é distribuído sob a licença MIT.