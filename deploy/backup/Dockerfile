FROM postgres:16-alpine

RUN apk add --no-cache tzdata \
  && mkdir -p /backups /scripts

COPY backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh

ENV BACKUP_KEEP_DAYS=7
ENV BACKUP_INTERVAL_SECONDS=86400
ENV TZ=Asia/Tashkent

VOLUME ["/backups"]

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD test -d /backups && pgrep -f backup.sh >/dev/null || exit 1

CMD ["/scripts/backup.sh"]
