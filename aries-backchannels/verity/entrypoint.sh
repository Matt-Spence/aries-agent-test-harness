#!/bin/bash

set -o pipefail

ANSII_GREEN='\u001b[32m'
ANSII_RESET='\x1b[0m'

# Handle ctrl-C to exit the application
trap_ctrlC() {
    if [ -n "$NGROK_PID" ]; then
        kill "$NGROK_PID"
    fi
    exit 1
}
trap trap_ctrlC SIGINT SIGTERM

provision() {
  echo
  echo "***************************   PROVISIONING    ************************"

  # If seed was not defined generate a random one
  if [ -z "$VERITY_SEED" ]; then
    VERITY_SEED=$(date +%s | md5sum | base64 | head -c 32)
  fi

  # If network was not defined default to "demo"
  NETWORK="von"
  TXN_FILE="von.txn"

  # Prepare genesis file and TAA data for the selected network

  export TXN_FILE="von.txn"
  DATE=$(date +%F)
  export TAA_ACCEPTANCE=$DATE
  export TAA_HASH="N/A"
  export TAA_VERSION="N/A"

  # Create DID/Verkey based on the provided VERITY_SEED 
  printf "wallet create test key=test\nwallet open test key=test\ndid new seed=%s" "${VERITY_SEED}" | indy-cli | tee /tmp/indy_cli_output.txt
  echo 

  run_mode="$RUN_MODE"
  docker_host="host.docker.internal"
  if [ ! -z "$DOCKER_HOST"] ; then 
    docker_host="$DOCKER_HOST"
  fi
  external_host="localhost"
  if [ run_mode == "docker"] ; then
    external_host=docker_host
  fi
  # Register Verity DID/Verkey on the ledger via VON-Network Registration endpoint
  ledger_url="http://$external_host:9000"
  if [ ! -z "$LEDGER_URL" ] ; then 
    ledger_url="$LEDGER_URL"
  fi
  curl -sd "{\"alias\":\"verity\",\"seed\":$DID,\"verkey\":$VERKEY\"}" ${ledger_url}/register


  # Write out TAA configruation to the file
  echo "verity.lib-indy.ledger.transaction_author_agreement.agreements = {\"${TAA_VERSION}\" = { digest = \${?TAA_HASH}, mechanism = on_file, time-of-acceptance = \${?TAA_ACCEPTANCE}}}" > /etc/verity/verity-application/taa.conf

  # Generate random logo
  ROBO_HASH=$(date +%s | md5sum | base64 | head -c 8)
  export LOGO_URL="http://robohash.org/${ROBO_HASH}"
  echo "**********************************************************************"
  echo

}

start_ngrok() {
  ngrok http 9000 >> /dev/null &
  NGROK_PID=$!
  until curl -m 1 -q http://127.0.0.1:4040/api/tunnels 2> /dev/null | jq -M -r -e '.tunnels[0].public_url' > /dev/null 2>&1
  do
    echo -n "."
    sleep 1
  done
}

save_env() {
  echo "export VERITY_SEED=$VERITY_SEED" >> provisioned.conf
  echo "export NETWORK=$NETWORK" >> provisioned.conf
  echo "export TXN_FILE=${TXN_FILE}" >> provisioned.conf
  echo "export TAA_VERSION=${TAA_VERSION}" >> provisioned.conf
  echo "export TAA_HASH=${TAA_HASH}" >> provisioned.conf
  echo "export TAA_ACCEPTANCE=${TAA_ACCEPTANCE}" >> provisioned.conf
  echo "export LOGO_URL=${LOGO_URL}" >> provisioned.conf
  echo "export HOST_ADDRESS=${HOST_ADDRESS}" >> provisioned.conf
}

print_config() {
  echo "******************        VERITY PARAMETERS         ******************"
  echo "VERITY_SEED=$VERITY_SEED"
  echo "NETWORK=$NETWORK"
  echo "TXN_FILE=${TXN_FILE}"
  echo "TAA_VERSION=${TAA_VERSION}"
  echo "TAA_HASH=${TAA_HASH}"
  echo "TAA_ACCEPTANCE=${TAA_ACCEPTANCE}"
  echo "LOGO_URL=${LOGO_URL}"
  echo "HOST_ADDRESS=${HOST_ADDRESS}"
  echo "**********************************************************************"
  echo
}

print_license() {
  echo
  echo "***********************        LICENSE         ***********************"
  echo "Verity application is available under the Business Source License"
  printf "${ANSII_GREEN}https://github.com/evernym/verity/blob/master/LICENSE.txt${ANSII_RESET}\n"
  echo "Please contact Evernym if you have any questions regarding Verity licensing"
  echo "**********************************************************************"
  echo
}

start_verity() {

  print_license

  if [ -f provisioned.conf ]; then
    # Provisioning file exists. This is start of the stopped Verity container
    # Source environment variables from the previous run
    . provisioned.conf
    export BOOTSTRAP="done"
  else
    # First time strart. Do the provisioning
    provision
    save_env
  fi

  print_config

  echo "**********************       VERITY STARTUP         ******************"
  # If public URL for docker Host is not specified start Ngrok tunnel to obtain public Verity Application endpoint
  if [ -z "$HOST_ADDRESS" ]; then
    echo "No HOST_ADDRESS specified"
    echo -n Starting ngrok..
    start_ngrok
    export HOST_ADDRESS=$(curl -m 1 -s http://127.0.0.1:4040/api/tunnels 2> /dev/null | jq -M -r '.tunnels[0].public_url')
  fi

  export HOST_DOMAIN=`echo $HOST_ADDRESS |  cut -d'/' -f3`

  echo
  printf "Verity Endpoint is: ${ANSII_GREEN}${HOST_ADDRESS}${ANSII_RESET}"
  echo
  echo

  # Start Verity Application
  /usr/bin/java -cp /etc/verity/verity-application:.m2/repository/org/fusesource/leveldbjni/leveldbjni-all/1.8/leveldbjni-all-1.8.jar:/usr/lib/verity-application/verity-application-assembly.jar \
  com.evernym.verity.Main &> log.txt &

  echo
  echo -n "Waiting for Verity to start listening."
  until curl -q 127.0.0.1:9000/agency > /dev/null 2>&1
  do
      echo -n "."
      sleep 1
  done
  echo

  # Bootstrap Verity Application with seed
  if [ -z "$BOOTSTRAP" ]; then
    echo "Bootstrapping Verity"
    echo
    echo "Verity Setup"
    curl -f -H "Content-Type: application/json" -X POST http://127.0.0.1:9000/agency/internal/setup/key \
    -d "{\"seed\":\"$VERITY_SEED\"}" || exit 1
    echo; echo
    echo "Verity Endpoint Setup"
    curl -f -X POST http://127.0.0.1:9000/agency/internal/setup/endpoint || exit 1
    echo; echo
    echo "Verity Bootstrapping complete."
  fi

  echo "Verity application started."
  echo "**********************************************************************"
  echo

  tail -f -n +1 log.txt
}

start_verity

node verity_backchannel.js