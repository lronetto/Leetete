.PHONY: help network up down restart status \
        up-main up-gitea up-wedding \
        down-main down-gitea down-wedding \
        logs-main logs-gitea logs-wedding \
        pull-main pull-gitea pull-wedding \
        rebuild-wedding

NET := infra-net
DC_MAIN := docker compose -f infra/main/docker-compose.yml --env-file infra/main/.env
DC_GITEA := docker compose -f infra/gitea/docker-compose.yml --env-file infra/gitea/.env
DC_WEDDING := docker compose -f infra/wedding_photo/docker-compose.yml --env-file infra/wedding_photo/.env

help:
	@echo "Stacks: main (postgres+redis+minio+pgadmin+caddy) | gitea | wedding_photo"
	@echo ""
	@echo "  make up                Sobe tudo na ordem (main -> gitea -> wedding)"
	@echo "  make down              Desce tudo na ordem inversa"
	@echo "  make restart           down + up"
	@echo "  make status            ps de todas as stacks"
	@echo ""
	@echo "  make up-main           Sobe só a stack main"
	@echo "  make up-gitea          Sobe só o gitea"
	@echo "  make up-wedding        Build + up do app wedding"
	@echo "  make rebuild-wedding   Force rebuild do app wedding"
	@echo "  make down-{main,gitea,wedding}"
	@echo "  make logs-{main,gitea,wedding}"
	@echo "  make pull-{main,gitea,wedding}"
	@echo "  make network           Cria a network external '$(NET)' (idempotente)"

network:
	@./network.sh

up: network up-main up-gitea up-wedding

down: down-wedding down-gitea down-main

restart: down up

status:
	@$(DC_MAIN) ps || true
	@$(DC_GITEA) ps || true
	@$(DC_WEDDING) ps || true

up-main: network
	$(DC_MAIN) up -d

up-gitea: network
	$(DC_GITEA) up -d

up-wedding: network
	$(DC_WEDDING) up -d --build

rebuild-wedding: network
	$(DC_WEDDING) build --no-cache
	$(DC_WEDDING) up -d

down-main:
	$(DC_MAIN) down

down-gitea:
	$(DC_GITEA) down

down-wedding:
	$(DC_WEDDING) down

logs-main:
	$(DC_MAIN) logs -f

logs-gitea:
	$(DC_GITEA) logs -f

logs-wedding:
	$(DC_WEDDING) logs -f

pull-main:
	$(DC_MAIN) pull

pull-gitea:
	$(DC_GITEA) pull

pull-wedding:
	$(DC_WEDDING) pull
