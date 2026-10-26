# A files-only image for the site on the shared VPS. Nothing in it runs: static-deploy.sh
# copies /site out with `docker create` + `docker cp` and the host Caddy serves the files.
# CI builds the site first (vite build -> dist/) and passes the folder as SITE_DIR.
FROM scratch
ARG SITE_DIR=dist
COPY ${SITE_DIR}/ /site/
# `docker create` needs a command; it never starts.
CMD ["/none"]
