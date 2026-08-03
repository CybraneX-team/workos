#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-startup-digital-twin-rg}"
VM_NAME="${VM_NAME:-erpnext-vm}"
SSH_USER="${SSH_USER:-erpadmin}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"
LOCAL_SHIM="${LOCAL_SHIM:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/index.js}"
REMOTE_DIR="/home/erpadmin/provision-shim"
ROLLOUT_ID="$(date -u +%Y%m%dT%H%M%SZ)"
STATUS_PATH="$REMOTE_DIR/workos-shim-rollout-$ROLLOUT_ID.status"

for dependency in az ssh scp ssh-keygen base64; do
  command -v "$dependency" >/dev/null || {
    echo "Missing required command: $dependency" >&2
    exit 1
  }
done

if command -v md5 >/dev/null; then
  LOCAL_MD5="$(md5 -q "$LOCAL_SHIM")"
else
  LOCAL_MD5="$(md5sum "$LOCAL_SHIM" | awk '{print $1}')"
fi

POWER_STATE="$(az vm get-instance-view \
  -g "$RESOURCE_GROUP" \
  -n "$VM_NAME" \
  --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0]" \
  -o tsv)"

if [[ "$POWER_STATE" != "VM running" ]]; then
  echo "Starting $VM_NAME (current state: ${POWER_STATE:-unknown})..."
  az vm start -g "$RESOURCE_GROUP" -n "$VM_NAME" --no-wait
fi

for _ in $(seq 1 42); do
  INSTANCE_STATE="$(az vm get-instance-view \
    -g "$RESOURCE_GROUP" \
    -n "$VM_NAME" \
    --query "{power:instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0],agent:instanceView.vmAgent.statuses[0].displayStatus}" \
    -o tsv)"
  if [[ "$INSTANCE_STATE" == *"VM running"* && "$INSTANCE_STATE" == *"Ready"* ]]; then
    break
  fi
  sleep 10
done

if [[ "$INSTANCE_STATE" != *"VM running"* || "$INSTANCE_STATE" != *"Ready"* ]]; then
  echo "Timed out waiting for $VM_NAME and its guest agent to become ready." >&2
  exit 1
fi

VM_INFO="$(az vm show -d \
  -g "$RESOURCE_GROUP" \
  -n "$VM_NAME" \
  --query "[publicIps,fqdns]" \
  -o tsv)"
PUBLIC_IP="$(awk '{print $1}' <<<"$VM_INFO")"
VM_FQDN="$(awk '{print $2}' <<<"$VM_INFO")"

if [[ -z "$PUBLIC_IP" || -z "$VM_FQDN" ]]; then
  echo "Could not resolve the VM public IP and FQDN." >&2
  exit 1
fi

if ! ssh-keygen -F "$PUBLIC_IP" -f "$HOME/.ssh/known_hosts" >/dev/null; then
  echo "No pinned SSH host key exists for $PUBLIC_IP. Verify and add it before deploying." >&2
  exit 1
fi

SSH_OPTIONS=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o "HostKeyAlias=$PUBLIC_IP"
)
SSH_TARGET="$SSH_USER@$VM_FQDN"

echo "Preflight: checking the current shim..."
ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
  'set -eu
   systemctl is-active erpnext-provision-shim
   curl -fsS --max-time 10 http://127.0.0.1:3001/health
   md5sum /home/erpadmin/provision-shim/index.js'

scp "${SSH_OPTIONS[@]}" "$LOCAL_SHIM" \
  "$SSH_TARGET:$REMOTE_DIR/index.js.reviewed"

REMOTE_SCRIPT="$(printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  "SHIM_DIR=$REMOTE_DIR" \
  "STATUS=$STATUS_PATH" \
  "EXPECTED_MD5=$LOCAL_MD5" \
  'BACKUP=""' \
  'echo "state=started" > "$STATUS"' \
  'rollback() {' \
  '  result=$?' \
  '  echo "state=failed result=$result" >> "$STATUS"' \
  '  if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then' \
  '    cp "$BACKUP" "$SHIM_DIR/index.js"' \
  '    chown erpadmin:erpadmin "$SHIM_DIR/index.js"' \
  '    chmod 0644 "$SHIM_DIR/index.js"' \
  '    systemctl restart erpnext-provision-shim || true' \
  '    echo "rollback=attempted" >> "$STATUS"' \
  '  fi' \
  '  exit "$result"' \
  '}' \
  'trap rollback ERR' \
  'ACTUAL_MD5=$(md5sum "$SHIM_DIR/index.js.reviewed" | awk "{print \$1}")' \
  '[[ "$ACTUAL_MD5" == "$EXPECTED_MD5" ]]' \
  'BACKUP="$SHIM_DIR/index.js.bak.$(date +%Y%m%d%H%M%S)"' \
  'cp "$SHIM_DIR/index.js" "$BACKUP"' \
  'install -o erpadmin -g erpadmin -m 0644 "$SHIM_DIR/index.js.reviewed" "$SHIM_DIR/index.js"' \
  'rm -f "$SHIM_DIR/index.js.reviewed"' \
  'systemctl restart erpnext-provision-shim' \
  'HEALTH=""' \
  'for _ in $(seq 1 20); do' \
  '  if HEALTH=$(curl -fsS --max-time 2 http://127.0.0.1:3001/health 2>/dev/null); then break; fi' \
  '  sleep 1' \
  'done' \
  '[[ "$HEALTH" == "{\"ok\":true}" ]]' \
  'systemctl is-active erpnext-provision-shim >> "$STATUS"' \
  'DEPLOYED_MD5=$(md5sum "$SHIM_DIR/index.js" | awk "{print \$1}")' \
  '[[ "$DEPLOYED_MD5" == "$EXPECTED_MD5" ]]' \
  'printf "state=success\nbackup=%s\ndeployed_md5=%s\nhealth=%s\n" "$BACKUP" "$DEPLOYED_MD5" "$HEALTH" >> "$STATUS"' \
  'trap - ERR')"
REMOTE_SCRIPT_B64="$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')"

echo "Deploying checksum $LOCAL_MD5..."
az vm run-command invoke \
  -g "$RESOURCE_GROUP" \
  -n "$VM_NAME" \
  --command-id RunShellScript \
  --no-wait \
  --scripts "echo '$REMOTE_SCRIPT_B64' | base64 -d | bash" \
  -o none

ROLLOUT_COMPLETE=0
for _ in $(seq 1 30); do
  ROLLOUT_STATUS="$(ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
    "cat '$STATUS_PATH' 2>/dev/null || true")"
  if grep -qE '^state=(success|failed)' <<<"$ROLLOUT_STATUS"; then
    printf '%s\n' "$ROLLOUT_STATUS"
    if ! grep -q '^state=success$' <<<"$ROLLOUT_STATUS"; then
      exit 1
    fi
    ROLLOUT_COMPLETE=1
    break
  fi
  sleep 5
done

if [[ "$ROLLOUT_COMPLETE" != "1" ]]; then
  echo "Timed out waiting for rollout status at $STATUS_PATH." >&2
  exit 1
fi

FINAL_MD5="$(ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
  "md5sum '$REMOTE_DIR/index.js' | awk '{print \\$1}'")"
FINAL_HEALTH="$(ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
  'curl -fsS --max-time 10 http://127.0.0.1:3001/health')"
FINAL_SERVICE="$(ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
  'systemctl is-active erpnext-provision-shim')"

[[ "$FINAL_MD5" == "$LOCAL_MD5" ]]
[[ "$FINAL_HEALTH" == '{"ok":true}' ]]
[[ "$FINAL_SERVICE" == "active" ]]

echo "Remote shim deployment verified."
