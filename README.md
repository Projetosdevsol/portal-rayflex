# Portal de Ativos - Rayflex

Plataforma web para **gestão de ativos de TI**: inventário de hardware, controle de colaboradores e acessos, licenças de software, unidades da empresa, tarefas, relatórios e auditoria — com dados em tempo real via Firebase.

## ✨ Funcionalidades

### 📦 Ativos
| Módulo | Rota | Destaques |
|---|---|---|
| Colaboradores | `/collaborators` | Credenciais criptografadas, máquina associada, status |
| Máquinas | `/machines` | Hardware, licença de SO, NF-e/DANFE, colaborador responsável |
| Servidores | `/servers` | Configuração, aplicações, CALs, armazenamento |
| Impressoras | `/printers` | Conexão, localização, manutenção e **foto do equipamento** |
| Nobreaks | `/ups` | Potência, bateria, equipamentos conectados e **foto** |
| Licenças | `/licenses` | Controle de quantidade, usuários atribuídos, expiração |

- Fotos armazenadas no **Firebase Storage** (`assets/...`), com miniatura na tabela, banner na grade e visualização ampliada nos detalhes.
- Importação/exportação Excel (`.xlsx`), filtros por status/unidade/SO, ordenação, paginação e visões tabela/grade.

### 🏢 Unidades (Gestão → Unidades, `/units`)
- Cadastro de filiais/unidades com endereço completo e CNPJ.
- **CEP**: preenchimento automático do endereço via [Brasil API](https://brasilapi.com.br) (`/api/cep/v2`).
- **CNPJ**: validação de dígitos + consulta à Brasil API (`/api/cnpj/v1`) com razão social e situação cadastral; o salvamento é bloqueado se o CNPJ for inválido.
- Contadores de colaboradores e ativos vinculados por unidade, com links diretos para as telas filtradas.
- O campo **Unidade** dos formulários de ativos é um seletor das unidades cadastradas.

### 📊 Gestão e controle
- **Dashboard** (`/dashboard`): totais, distribuição de ativos, SO, status, top setores, uso de licenças e ativos por unidade.
- **Controle** (`/controle`): gestão centralizada de credenciais e ativos por colaborador.
- **Relatórios** (`/reports`): máquinas e colaboradores por setor, exportação PDF/Excel.
- **Tarefas** (`/tasks`), **Auditoria** (`/audit-reports`), **Usuários** (`/users`) e **Configurações** (`/settings`).
- Busca universal, notificações, comentários por ativo, temas claro/escuro e controle de acesso por papéis (`viewer`, `editor`, `manager`, `admin`, `super_admin`).

## 🛠️ Tecnologias

- **Frontend:** React 19, TypeScript, React Router 7, Tailwind CSS 4, Motion, Recharts, Lucide Icons
- **Backend/BaaS:** Firebase (Auth, Firestore, Storage) + `firebase-admin` no servidor Express
- **Build:** Vite 6 · **Dados:** `xlsx`, `papaparse`, `jspdf` · **Cripto:** `crypto-js`

## ✅ Pré-requisitos

- [Node.js](https://nodejs.org/) 20+ e npm
- Conta Firebase com projeto criado (ex.: `portal-rayflex`) e [Firebase CLI](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`)
- Arquivo `firebase-applet-config.json` na raiz com as credenciais do app

## 🚀 Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com GEMINI_API_KEY, APP_URL e FIREBASE_SERVICE_ACCOUNT_KEY

# 3. Rodar em desenvolvimento
npm run dev
```

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (`tsx server.ts`) |
| `npm run build` | Build de produção (`vite build` → `dist/`) |
| `npm run start` | Serve o build em produção (`node server.ts`) |
| `npm run preview` | Pré-visualização do build (`vite preview`) |
| `npm run lint` | Verificação de tipos (`tsc --noEmit`) |
| `npm run clean` | Remove a pasta `dist/` |

## 🔥 Firebase: regras e deploy

O repositório já contém a configuração do CLI:

- `firebase.json` — mapeia `firestore.rules` e `storage.rules`
- `.firebaserc` — projeto padrão: `portal-rayflex`
- `firebase-blueprint.json` — modelo de dados (entidades e coleções)

```bash
firebase login
firebase deploy --only firestore:rules,storage
```

> Para publicar só uma parte: `firebase deploy --only firestore:rules` ou `firebase deploy --only storage`.
> O deploy das regras é obrigatório após Pull — sem ele, coleções novas (ex.: `units`, `ups`) ficam inacessíveis.

## 📁 Estrutura do projeto

```
├── src/
│   ├── components/      # Telas (AssetList, Dashboard, Units, Reports, ...)
│   ├── contexts/        # AuthContext, DataContext (tempo real via onSnapshot)
│   ├── hooks/           # Hooks compartilhados
│   ├── utils/           # audit, brasilApi (CEP/CNPJ), crypto, format
│   ├── App.tsx          # Rotas protegidas por papel
│   ├── firebase.ts      # Auth, Firestore e Storage
│   └── types.ts         # Entidades (Collaborator, Machine, Unit, ...)
├── firebase.json / .firebaserc
├── firestore.rules / storage.rules
├── firebase-blueprint.json
└── server.ts            # Servidor Express (produção)
```

## 🔐 Papéis e permissões

| Papel | Pode |
|---|---|
| `viewer` | Visualizar |
| `editor` | Criar/editar ativos (justificativa exigida em campos críticos) |
| `manager` | Como editor + gestão de equipes |
| `admin` | Gestão completa, exceto usuários/auditoria |
| `super_admin` | Tudo, incluindo excluir, desativar e gerenciar usuários |

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** — veja o arquivo [LICENSE](LICENSE) para detalhes.
