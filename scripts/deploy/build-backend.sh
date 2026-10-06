#!/bin/sh
set -eu
# Optional session trust and proxy settings stay in the builder's RUN only.
arc_build_temp="$(mktemp -d)"
trap 'rm -rf "$arc_build_temp"' EXIT
arc_java_options=''
if [ -f /run/secrets/proxy_ca ]; then
  cp "$JAVA_HOME/lib/security/cacerts" "$arc_build_temp/cacerts"
  keytool -importcert -noprompt -alias arc-build-proxy -file /run/secrets/proxy_ca \
    -keystore "$arc_build_temp/cacerts" -storepass changeit >/dev/null 2>&1
  arc_java_options="-Djavax.net.ssl.trustStore=$arc_build_temp/cacerts -Djavax.net.ssl.trustStorePassword=changeit"
fi
if [ -f /run/secrets/proxy_bundle ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_bundle; fi
arc_build_proxy="${HTTPS_PROXY:-${HTTP_PROXY:-}}"
if [ -n "$arc_build_proxy" ]; then
  arc_proxy_authority="${arc_build_proxy#*://}"
  arc_proxy_authority="${arc_proxy_authority%%/*}"
  arc_proxy_authority="${arc_proxy_authority##*@}"
  arc_proxy_host="${arc_proxy_authority%:*}"
  arc_proxy_port="${arc_proxy_authority##*:}"
  arc_java_options="$arc_java_options -Dhttps.proxyHost=$arc_proxy_host -Dhttps.proxyPort=$arc_proxy_port -Dhttp.proxyHost=$arc_proxy_host -Dhttp.proxyPort=$arc_proxy_port"
fi
export JAVA_TOOL_OPTIONS="$arc_java_options"
sh backend/gradlew -p backend --no-daemon bootJar
cp backend/build/libs/*.jar arc.jar
