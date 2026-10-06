# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk AS build
WORKDIR /source
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts backend/
COPY backend/gradle/ backend/gradle/
COPY backend/src/ backend/src/
COPY scripts/deploy/build-backend.sh scripts/deploy/build-backend.sh
RUN --mount=type=secret,id=proxy_ca --mount=type=secret,id=proxy_bundle --mount=type=cache,target=/root/.gradle \
    sh scripts/deploy/build-backend.sh

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S -g 10001 arc && adduser -S -u 10001 -G arc arc
WORKDIR /app
COPY --from=build --chown=arc:arc /source/arc.jar /app/arc.jar
USER arc
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 \
    CMD wget -Y off -q -O - http://127.0.0.1:8080/actuator/health >/dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/arc.jar"]
