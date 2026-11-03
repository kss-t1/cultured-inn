#!/usr/bin/env bash
# Creates the Always Free VM on the VCN wizard's public subnet, with a public IP, and opens
# TCP 80/443 in that subnet's security list. The console's Create-instance form may refuse
# to offer a public subnet or IP; this does the same from Oracle Cloud Shell, where `oci` is
# already logged in. Usage in Cloud Shell: bash oci-launch.sh "$(cat id_ed25519.pub)"
# or paste it with KEY set. Prints the public IP.
set -uo pipefail

KEY="${1:-${KEY:?pass the SSH public key as the first argument}}"
C=$OCI_TENANCY
SUBNET=$(oci network subnet list -c "$C" --all --query 'data[?"prohibit-public-ip-on-vnic"==`false`] | [0].id' --raw-output)
[ -n "$SUBNET" ] || { echo "no public subnet: run Networking → VCN Wizard → Create VCN with Internet Connectivity"; exit 1; }
IMAGE=$(oci compute image list -c "$C" --all --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC --query 'data[?!contains("display-name", `Minimal`)] | [0].id' --raw-output)

ID=
for AD in $(oci iam availability-domain list -c "$C" --query 'data[].name' | jq -r '.[]'); do
  echo "trying $AD ..."
  ID=$(oci compute instance launch -c "$C" --availability-domain "$AD" --shape VM.Standard.A1.Flex \
    --shape-config '{"ocpus":1,"memoryInGBs":6}' --image-id "$IMAGE" --subnet-id "$SUBNET" \
    --assign-public-ip true --display-name cultural-inn \
    --metadata "{\"ssh_authorized_keys\":\"$KEY\"}" \
    --wait-for-state RUNNING --query 'data.id' --raw-output) && break
done
[ -n "$ID" ] || { echo "no capacity in any availability domain; try again later"; exit 1; }

# The CLI prints kebab-case keys but expects camelCase back; add 80/443 only if missing.
SL=$(oci network subnet get --subnet-id "$SUBNET" --query 'data."security-list-ids"[0]' --raw-output)
oci network security-list get --security-list-id "$SL" --query 'data."ingress-security-rules"' \
  | jq 'walk(if type=="object" then with_entries(.key |= gsub("-(?<c>[a-z])"; .c|ascii_upcase)) else . end)
        | . + ([80,443] - [.[] | .tcpOptions.destinationPortRange.min? // empty]
               | map({source:"0.0.0.0/0", protocol:"6", isStateless:false, tcpOptions:{destinationPortRange:{min:., max:.}}}))' \
  > /tmp/rules.json
oci network security-list update --security-list-id "$SL" --ingress-security-rules file:///tmp/rules.json --force >/dev/null && echo "ports 80/443 open"
echo "PUBLIC IP: $(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output)"
