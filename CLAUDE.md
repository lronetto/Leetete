# CLAUDE.md

Notas de projeto pro Claude Code (e qualquer dev que entre depois). Resume todas as decisões tomadas ao longo das conversas. Linguagem do projeto: **PT-BR**.

---

## 1. Visão geral

App web pro casamento de **Stefanie & Leandro**. Convidados escaneiam um QR Code na mesa, abrem o site, mandam fotos/vídeos + uma mensagem. Os noivos administram tudo num painel `/admin`.

**Escopo**: single-tenant (um casamento). Multi-tenant (SaaS) foi avaliado — fica pra um pivot futuro se houver demanda real (3+ pedidos).

---

## 2. Arquitetura: 3 stacks Docker Compose

Cada stack é um `docker-compose.yml` isolado. Os 3 compartilham uma **network Docker externa** chamada `infra-net`.

```
infra/
├── main/           Postgres + Redis + MinIO + pgAdmin + Caddy
├── gitea/          Gitea + Actions runner
└── wedding_photo/  App FastAPI + sidecars de backup
```

**Por que separados**: cada stack tem seu próprio ciclo de vida (`make up-main`, `make up-gitea`, `make up-wedding`). Subir/derrubar uma não afeta as outras. Gitea pode ser desativado sem tocar no app.

**`main/` é o "platform layer"** que os consumidores usam. `gitea/` e `wedding_photo/` conectam ao Postgres e MinIO de lá.

---

## 3. Stack técnica

| Camada | Escolha | Por quê |
|---|---|---|
| HTTP framework | **FastAPI 0.115** | Async-first, OpenAPI auto, Pydantic v2 |
| ASGI server | **uvicorn** | Padrão de fato |
| ORM | **SQLAlchemy 2.0 async + asyncpg** | Tipos modernos, drivers async maduros |
| Validação | **Pydantic v2** | Built-in no FastAPI; camelCase no wire |
| Env loader | **pydantic-settings** | Falha rápido em var faltando |
| Storage SDK | **boto3** wrapped em `asyncio.to_thread` | S3 compatível, lida com MinIO + R2 + B2 idem |
| Auth | **pyjwt** + cookie HttpOnly | 7 dias, HS256, constant-time compare |
| QR codes | **qrcode** + **reportlab** | PNG/SVG/PDF A6 imprimível |
| HEIC | **pillow-heif** | Decode iPhone HEIC → JPEG no `/confirm` |
| Frontend | **Vite + React 18 + Tailwind + react-router** | Stack comum, rápida |
| DB | **Postgres 16** | Multi-banco em uma instância (wedding + gitea) |
| Cache | **Redis 7** | Gitea usa hoje (cache + sessões); wedding pode usar depois |
| Storage | **MinIO** | S3 compat self-hosted; código portável pra R2/B2 |
| Reverse proxy | **Caddy 2** | TLS auto (Let's Encrypt em prod, interno em `*.localhost` dev) |
| Git hosting | **Gitea 1.22** + Actions runner | Self-hosted, leve, compatível com GitHub Actions |
| Backup | `prodrigestivill/postgres-backup-local` + `alpine + mc` | Sidecars com cron, rotação dias/semanas/meses |
| Package mgmt | **uv** (Python), **pnpm** (Node) | Mais rápidos que pip/npm |

---

## 4. Estrutura de diretórios completa

```
.
├── .gitignore
├── Makefile                       # Orquestra as 3 stacks
├── network.sh                     # Cria infra-net (idempotente)
├── CLAUDE.md                      # Este arquivo
│
└── infra/
    │
    ├── main/                      # PLATFORM LAYER
    │   ├── docker-compose.yml
    │   ├── .env.example
    │   ├── caddy/Caddyfile        # hostname-based routing
    │   ├── postgres/init/01-create-databases.sh  # cria DBs wedding + gitea
    │   ├── minio/{init.sh, cors.json}            # cria bucket wedding-media
    │   └── pgadmin/servers.json   # postgres pré-conectado
    │
    ├── gitea/                     # GIT + CI
    │   ├── docker-compose.yml
    │   ├── .env.example
    │   └── runner/Dockerfile      # act_runner + docker-cli
    │
    └── wedding_photo/             # APLICAÇÃO
        ├── docker-compose.yml     # app + postgres-backup + media-backup
        ├── .env.example
        ├── Dockerfile             # multi-stage Node(build web) + Python(runtime)
        ├── Makefile               # dev local (uv, pnpm) — não duplica root
        ├── pyproject.toml, package.json, pnpm-workspace.yaml, ...
        ├── apps/
        │   ├── api/               # FastAPI Python
        │   │   ├── pyproject.toml
        │   │   └── app/
        │   │       ├── main.py             # FastAPI app, lifespan, SPA fallback
        │   │       ├── config.py           # pydantic-settings
        │   │       ├── db/{base,models,migrate}.py
        │   │       ├── migrations/         # SQL puro, runner idempotente
        │   │       ├── lib/                # auth, storage, qrcode, pdf, ids, transcode
        │   │       ├── schemas/api.py      # Pydantic v2 wire models
        │   │       └── routes/{public,uploads,admin}.py
        │   └── web/               # Vite + React + Tailwind SPA
        │       ├── index.html
        │       ├── vite.config.ts
        │       ├── tailwind.config.ts
        │       └── src/
        │           ├── main.tsx, App.tsx
        │           ├── routes/{Home,Upload,Gallery}.tsx + admin/{Login,Dashboard}.tsx
        │           └── lib/{api,upload}.ts
        ├── packages/shared/       # Zod schemas TS (usado pelo web)
        ├── infra/backup/          # entrypoint + script do media-backup
        └── backups/               # destino dos sidecars (gitignored)
            ├── postgres/
            └── media/
```

---

## 5. Network e roteamento

### Network
`infra-net` é **external**. Criada pelo `network.sh` (chamada por `make network`). Containers de stacks diferentes se enxergam por nome via DNS interno do Docker.

### Container names fixos
- `postgres`, `redis`, `minio`, `pgadmin`, `caddy` (stack main)
- `gitea`, `gitea_runner` (stack gitea)
- `wedding_app`, `wedding_pg_backup`, `wedding_media_backup` (stack wedding_photo)

### URLs (com `DOMAIN_BASE`)

| Hostname | Serve |
|---|---|
| `https://wedding.{DOMAIN_BASE}` | Site dos noivos (uploads + galeria + admin) |
| `https://gitea.{DOMAIN_BASE}` | Git hosting + Actions |
| `https://pgadmin.{DOMAIN_BASE}` | Web UI dos bancos |
| `https://minio.{DOMAIN_BASE}` | Console admin do MinIO |
| `https://media.{DOMAIN_BASE}` | S3 API pública do MinIO (uploads/downloads) |
| `ssh://git@gitea.{DOMAIN_BASE}:2222` | Git via SSH |

### `DOMAIN_BASE`
- **Dev local**: `localhost` → Caddy emite cert interno automático pra `*.localhost`
- **Produção**: domínio real (ex.: `lronetto.com`) → Let's Encrypt automático
- Mudar `DOMAIN_BASE` requer **down + up** das 3 stacks (envs lidos no boot)

### Hairpin / `extra_hosts`
`wedding_app` tem `extra_hosts: media.{DOMAIN_BASE}:host-gateway` e `wedding.{DOMAIN_BASE}:host-gateway` pra que, mesmo dentro do container, ele resolva esses hostnames pro Docker host gateway → Caddy. Assim assinaturas S3 fecham (signing host == host que o browser usa pra PUT).

---

## 6. Comandos

### Root `Makefile`
```bash
make help              # lista tudo
make up                # network + main + gitea + wedding (na ordem)
make down              # inverso
make restart           # down + up
make status            # ps das 3 stacks

make up-main           # só infra base
make up-gitea
make up-wedding        # rebuilda imagem do app

make rebuild-wedding   # build --no-cache + up
make down-{main,gitea,wedding}
make logs-{main,gitea,wedding}
make pull-{main,gitea,wedding}
```

### Wedding `Makefile` (dev local, fora do Docker)
```bash
make install           # pnpm install + uv sync
make dev-web           # vite na 5173
make dev-api           # uvicorn --reload na 3000
make migrate           # roda migrations do D1
make build             # build do front
make typecheck
make lint
```

---

## 7. Convenções

### Variáveis de ambiente
- **SCREAMING_SNAKE_CASE**
- Cada stack tem seu `.env` (cópia do `.env.example` ao lado)
- Variáveis compartilhadas entre stacks (`DOMAIN_BASE`, `MINIO_ROOT_*`, `WEDDING_DB_*`) precisam casar manualmente
- Senhas defaults nos `.env.example` são placeholders `troque-essa-senha-forte` — sempre trocar
- `SESSION_SECRET` mínimo 16 chars (sugestão: UUID + sufixo)

### IDs
- Nanoid 16 chars + prefixo: `up_xxxx...` (upload), `au_xxxx...` (audit)
- Implementação em `apps/api/app/lib/ids.py`

### API wire format
- **camelCase** (`coupleNames`, `createdAt`, `maxFileMb`, etc.)
- Mesmo schema entre Python (Pydantic) e TS (Zod) — campos batem nome-a-nome
- Erros: `{"error": "code", "details": ...}` com HTTP status apropriado

### Timestamps
- `bigint` em ms desde epoch (não `timestamptz`)
- Razões: lida fácil com JS `Date.now()`, sort sem timezone, não precisa de cast
- Default no DB: `(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`

### Migrations
- SQL puro em `apps/api/app/migrations/NNNN_descricao.sql`
- Runner em `app/db/migrate.py`: idempotente, valida SHA256 (impede editar migration aplicada)
- Roda automaticamente no boot do `wedding_app` (`AUTO_MIGRATE=true`)
- Schema sempre em **Postgres puro** (não SQLite syntax)

### Storage keys
- Formato: `uploads/{YYYY}/{MM}/{id}.{ext}`
- Ex.: `uploads/2026/06/up_abc123def456.jpg`
- Extensão vem do filename, fallback no MIME type

---

## 8. Fluxos importantes

### Upload (convidado)
1. `POST /api/uploads/init` → backend valida (tamanho, vídeo permitido, duração), cria row `pending`, retorna URL pré-assinada
2. Browser faz **`PUT` direto no MinIO** (não passa pelo backend) com a URL pré-assinada
3. Decisão **single vs multipart**:
   - `<= 50 MB`: single PUT
   - `> 50 MB`: multipart 10 MB chunks
4. `POST /api/uploads/:id/confirm` → backend faz HEAD pra verificar o objeto, completa multipart se aplicável, **se for HEIC**: transcoda pra JPEG e substitui o storage_key, marca `approved` (ou `pending` se moderation=`pre`)
5. Galeria pública lista só `status=approved`

### HEIC transcoding
- Detecção: `mime_type in {"image/heic", "image/heif"}`
- Em `/confirm` após HEAD: baixa, decoda com pillow-heif, aplica EXIF rotation, salva JPEG quality 88 progressive, escreve com `.jpg`, deleta HEIC
- **Falha não bloqueia o upload**: log + mantém HEIC original (gallery mostra placeholder)
- Razão: browsers (especialmente Android) não renderizam HEIC nativamente

### Multipart upload (cliente)
- Em `apps/web/src/lib/upload.ts`
- Sequential (não paralelo pra MVP) com `XMLHttpRequest` (precisa de progress event)
- ETag de cada chunk via header `etag` na resposta — exige CORS `ExposeHeaders: ["ETag"]` no bucket

### Admin login
- `POST /api/admin/login` body `{email, password}`
- Valida email contra `ALLOWED_ADMIN_EMAILS` (separados por vírgula no env)
- Compara senha com `ADMIN_PASSWORD` via `hmac.compare_digest` (constant-time)
- Issue cookie HttpOnly JWT HS256 com email + exp 7 dias
- `GET /api/admin/*` decora com `Depends(get_admin_email)` que verifica o cookie

### Admin: gestão de uploads
- `GET /api/admin/uploads?status=...&kind=photo|video&q=...&cursor=...` — paginação por timestamp DESC
- `PATCH /api/admin/uploads/:id` — edita `authorName` + `message`
- `POST /api/admin/uploads/:id/{approve,reject,cover}` — actions individuais
- `DELETE /api/admin/uploads/:id` — apaga do banco + storage (incl. thumbnail)
- `POST /api/admin/uploads/bulk` — `{action: approve|reject|delete, ids: [...]}` até 200 IDs
- `DELETE /api/admin/event/cover` — remove a foto de capa

### Backup
- **Postgres**: `prodrigestivill/postgres-backup-local` daily, retenção dias/semanas/meses, escreve em `./backups/postgres/` (bind mount do host)
- **MinIO**: alpine + mc cron-driven, `mc mirror` (incremental) pra `./backups/media/`
- **Backup remoto opcional**: configurar `BACKUP_REMOTE_*` no `.env` da wedding → espelha pra outro endpoint S3 (R2/B2/etc.)

### Gitea bootstrap (1ª vez)
1. `make up-main` (precisa estar de pé pro postgres + redis)
2. `make up-gitea` (runner falha porque ainda não tem token, ok)
3. Cria user admin via CLI (nome **NÃO pode ser `admin`** — é reservado):
   ```bash
   read -s PW
   docker exec -u git -it gitea gitea admin user create \
     --username lronetto --password "$PW" --email lronetto@gmail.com --admin
   ```
4. Abre `https://gitea.{DOMAIN_BASE}` → loga
5. Avatar → **Site Administration** → **Actions** → **Runners** → **Create new Runner** → copia token
6. Cola em `infra/gitea/.env`: `GITEA_RUNNER_TOKEN=<token>`
7. `make up-gitea` (runner agora se registra)

### Trocar senha do Gitea
```bash
read -s NEWPW
docker exec -u git -it gitea gitea admin user change-password \
  --username lronetto --password "$NEWPW"
```

---

## 9. Gotchas conhecidos

### Postgres init script só roda na 1ª vez
`infra/main/postgres/init/01-create-databases.sh` é executado pelo entrypoint do postgres **apenas quando `PGDATA` está vazio**. Pra "rerodar":
```bash
make down-main
sudo rm -rf infra/main/postgres/data
make up-main
```

Alternativa: criar manualmente via `docker exec -i postgres psql`.

### `docker exec -it` com heredoc
`-t` aloca TTY e conflita com stdin redirecionado. Usar **`-i` só**:
```bash
docker exec -i postgres psql -U postgres <<EOF
CREATE ROLE gitea WITH LOGIN PASSWORD 'xxx';
EOF
```

### Gitea reservou nomes
`admin`, `api`, `user`, `org`, `explore`, `install`, `repo` etc. são reservados. Use outro nome (ex.: `lronetto`, `gitadmin`). O role admin vem do flag `--admin`, não do username.

### Gitea: imagem regular vs rootless
Volumes diferentes:
- `gitea/gitea:1.22` (regular): `/data`
- `gitea/gitea:1.22-rootless`: `/var/lib/gitea` + `/etc/gitea`

Usamos a **regular** com `INSTALL_LOCK=true` pra pular o wizard `/install` no primeiro boot.

### `docker exec` por padrão entra como root
Pra Gitea, isso quebra (`Gitea is not supposed to be run as root`). Sempre `docker exec -u git ...` quando for chamar binário do gitea.

### CORS no MinIO
Bucket precisa de `ExposeHeaders: ["ETag"]` pra multipart funcionar (cliente lê ETag de cada PUT). Aplicado pelo `infra/main/minio/init.sh` via `mc cors set`.

### Postgres path-style URLs
`S3_FORCE_PATH_STYLE=true` é necessário pra MinIO. Sem isso, boto3 monta URL virtual-hosted (`bucket.endpoint/key`) que MinIO single-instance não suporta.

### Mudança em `.env` exige restart
Compose só lê env vars no boot do container. `make down-X && make up-X` após editar.

### TLS local em `*.localhost`
Caddy emite cert auto-assinado pelo root local. Browser pede pra aceitar (1x por subdomínio). Pra evitar prompts:
```bash
docker exec caddy cat /data/caddy/pki/authorities/local/root.crt > /tmp/caddy-root.crt
# Importa no trust store do OS/browser
```

### Configurar firewall em produção
- VPS firewall (ufw/iptables): liberar 80 e 443
- **Cloud firewall** (security group AWS/DO/Vultr): também liberar 80 e 443 — esse é separado e quase sempre é o esquecido
- Caddy ACME challenge precisa de **80 acessível externamente**, senão Let's Encrypt falha

### DNS precisa apontar antes do `up`
Pra produção, registros A pros subdomínios (`wedding`, `gitea`, `media`, `pgadmin`, `minio`) precisam estar propagados antes do Caddy tentar emitir cert. Senão ele entra em backoff e demora.

### `ACME_EMAIL` obrigatório em prod
Let's Encrypt requer email pra contato de renovação. Em dev pode ficar vazio (Caddy usa internal CA).

### Hairpin DNS no `wedding_app`
O `extra_hosts: host-gateway` pra `media.{DOMAIN_BASE}` faz o container resolver o subdomínio pro host. Sem isso, requests server-side (HEAD/DELETE/multipart complete) vão pra IP público → roteador → host → Caddy (lentidão). Com host-gateway: container → host → Caddy (rápido).

---

## 10. Histórico de iterações (sem detalhe — referência rápida)

1. **MVP Cloudflare**: Workers + D1 + R2 + Pages + Access. Funcionou mas Access não rola em `*.workers.dev`.
2. **Migração 1**: full Docker (Node/Hono + Postgres + MinIO + Caddy). Single compose, deploy num VPS.
3. **Migração 2**: backend reescrito em Python (FastAPI + SQLAlchemy + boto3 + pyjwt). Mesmo contrato de API. Frontend não mexeu.
4. **HEIC + backup**: pillow-heif no `/confirm`, 2 sidecars de backup (Postgres + MinIO mirror).
5. **Reorganização em 3 stacks**: `infra/main` + `infra/gitea` + `infra/wedding_photo` compartilhando `infra-net`. Caddy concentrado em `main/`.

Branches relevantes:
- `claude/wedding-qrcode-photos-C0PQt` (Cloudflare original)
- `claude/docker-vps-migration` (1ª migração Docker Node)
- `claude/python-backend` (atual; Python + restructure 3 stacks)

---

## 11. Onde olhar pra estender

| Quero adicionar... | Olha em |
|---|---|
| Nova rota pública | `apps/api/app/routes/public.py` |
| Nova rota admin | `apps/api/app/routes/admin.py` |
| Novo campo no upload | `apps/api/app/db/models.py` + nova migration + `apps/api/app/schemas/api.py` + atualizar `routes/uploads.py` |
| Novo bucket no MinIO | `infra/main/minio/init.sh` + variável no `.env.example` |
| Outro DB no postgres | `infra/main/postgres/init/01-create-databases.sh` + role nova |
| Novo subdomínio Caddy | `infra/main/caddy/Caddyfile` + container_name correspondente |
| Nova app na rede | criar `infra/<app>/docker-compose.yml`, declarar `infra-net` como external, conectar a `postgres`/`redis`/`minio` por nome |
| Nova tela no front | `apps/web/src/routes/` + rota em `App.tsx` |
| Schema compartilhado front-back | duplica: Zod em `packages/shared/src/schemas.ts` (TS) + Pydantic em `apps/api/app/schemas/api.py` (Python). **Camelo nos dois** |
| Workflow CI no Gitea | `.gitea/workflows/*.yml` no repo (sintaxe GitHub Actions) — runner já registrado |

---

## 12. Decisões deferidas (a fazer se necessário)

- **Thumbnails server-side**: galeria carrega imagens full-size. Pra otimizar: `sharp` no upload `/confirm` (ou um job async), salvar `thumbnail_key`. ~2h.
- **Export ZIP do admin**: streamed ZIP de todos os uploads. ~1h.
- **Rate limit em `/uploads/init`**: hoje sem limite. Vale colocar Redis-based se houver suspeita de abuso. ~1h.
- **Email aos noivos quando upload chegar**: Resend ou SMTP. ~2h.
- **Slideshow pra projetar na recepção**: tela `/slideshow` com auto-advance. ~30 min.
- **Custom domain do bucket público** (em vez de `media.X`): mais "branded". DNS + CNAME pro MinIO. ~15 min.
- **Pivot multi-tenant SaaS**: ver seção 1 — 2-4 semanas se valer a pena.
