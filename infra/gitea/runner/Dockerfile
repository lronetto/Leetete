FROM gitea/act_runner:latest

# Adiciona docker CLI pro runner conseguir buildar/pushar imagens dentro
# dos workflows (Action `docker/build-push-action` etc.). O socket do host
# é montado via volume no docker-compose.yml.
USER root
RUN apk add --no-cache docker-cli docker-cli-buildx
