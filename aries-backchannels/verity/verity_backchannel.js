"use strict";
import minimist from "minimist";
//Express
const axios = require('axios')
const bodyParser = require('body-parser')
const express = require("express");
const session = require("express-session");
const fs = require('fs');
const sdk = require('verity-sdk')
const request = require('request-promise-native');

const CONTEXT_PATH = './verity_config/verity-context.json'
const CONFIG_PATH = './verity_config/config.json'

const config = JSON.parse(fs.readFileSync(CONFIG_PATH))

const WALLET_NAME = config.WALLET.NAME
const WALLET_KEY = config.WALLET.KEY
const TOKEN = ""    // No provision token necessary on local verity instance
const VERITY_URL = ""
const LISTENING_PORT = config.APP.LISTENING_PORT

async function main() {
    const cliArguments = minimist(process.argv.slice(2), {
        alias: {
            port: "p",
        },
        default: {
            port: 9020,
        },
    });

    const VERITY_URL = process.env.HOST_ADDRESS

    const backchannelPort = Number(cliArguments.port);
    const agentPort = backchannelPort + 1;
    const dockerHost = process.env.DOCKERHOST ?? "host.docker.internal";
    const runMode = process.env.RUN_MODE;
    const externalHost = runMode === "docker" ? dockerHost: "localhost";

    const endpointUrl = `http://${externalHost}`

    const genesisFile = process.env.GENESIS_FILE;
    const genesisUrl = process.env.GENESIS_URL;
    const ledgerUrl = process.env.LEDGER_URL ?? `http://${externalHost}:9000`;
    // won't be necessary until more functionality is implemented
    // const genesisPath = await getGenesisPath(
    //     genesisFile,
    //     genesisUrl,
    //     ledgerUrl,
    //     dockerHost
    // );

    async function get_genesis_txns(){
        var genesis
        if (genesisUrl){
            axios.get(`http://dev.bcovrin.vonx.io/genesis`)
            .then(function (response) {
                console.log(response)
                genesis = response.body
            })
        }
        else if (runMode == "docker"){
            axios.get(`${ledgerUrl}/genesis`)
            .then(function (response) {
                console.log(response)
                genesis = response.body
            })
        } else {
            genesis = fs.readFileSync("../local-genesis.txt")
        }
    }

    genesis = await get_genesis_txns()

    const app = express()
    app.use(express.text({
        type: function (_) {
          return 'text'
        }
    }))

    app.use(session({secret:'SHHHHHHHHH'}))

    function defaultHandler (message) {
        console.log(`Unhandled message:${message}`)
    }

    const handlers = new sdk.Handlers()
    handlers.setDefaultHandler(defaultHandler)

    const connectionsMap = {}

    async function provisionAgent () {
        // create initial Context
        var ctx = await sdk.Context.create(WALLET_NAME, WALLET_KEY, VERITY_URL, '')
        console.log('wallet created')
        const provision = new sdk.protocols.v0_7.Provision(null, TOKEN)

        try {
            const context = await provision.provision(ctx)
            fs.writeFileSync(CONTEXT_PATH, JSON.stringify(context.getConfig()))  
            console.log(`Context written to file: ${JSON.stringify(context.getConfig())}`)
            return context
        } catch (e) {
            console.log(e)
        }
    }

    async function updateConfigs() {
        context.endpointUrl = `http://${externalHost}:${agentPort}/webhook`
    }

    const context = await provisionAgent()
    await UpdateConfigs()

    async function handleConnectionPostOperation(operation, data, res, id=None) {
        switch (operation) {
            case 'create-invitation': 
                result = await createInvitation()
                res.setStatus(200).send(`{"connection_id": "${result[0]}", "state": "N/A", "invitation": "${JSON.stringify(result[1])}"`)
                break;
            case 'receive-invitation': 
                result = await receiveInvitation(data)
                connectionsMap[result[0]] = result[1]
                res.setStatus(200).send('{"state":"N/A"')
                break;
            case 'accept-invitation': 
                result = await acceptInvitation(data, id)
                res.setStatus(501).send()
                break;
            case 'send-ping':
                res.sendStatus(501).send()
                break;
                // return await sendPing();
            default: 
                res.sendStatus(501).send()
        }
    }

    app.post('/agent/command/:topic/:operation', async function(req, res) {
        switch(req.params.topic) {
            case 'Connection':
                await handleConnectionPostOperation(req.params.operation, req.body.data, res, req.body.id)
                break;
            default:
                res.sendStatus(501).send()
                break;
        }
    })

    async function createInvitation() {
        const relationship = new sdk.protocols.v1_0.Relationship(None, None, None, None, None)
        const relationshipKeys = new Promise((resolve) => {
            handlers.addHandler(relationship.msgFamily, relationship.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case relationship.msgNames.CREATED:
                        console.log(message)
                        const threadId = message['~thread'].thid
                        var relDID = message.did
                        const verKey = message.verKey
                        console.log(`relationship DID: ${relDID}`)
                        console.log(`relationship verKey: ${message.verKey}`)
                        //TODO: save these values in the database
                        resolve([relDID, threadId])
                        break
                    case relationship.msgNames.CONNECTION_INVITATION:
                        resolve(message.inviteURL)
                }
            })
        })
        relationship.create(context)
        await relationshipKeys

        relDid = relationshipKeys[0]
        threadId = relationshipKeys[1]

        const invitation = new Promise((resolve) => {
            handlers.addHandler(relationship.msgFamily, relationship.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case relationship.msgNames.INVITATION:
                        console.log(message)
                        resolve(message.inviteURL)
                        break
                }
            })
        })

        await relationship.connectionInvitation(context)
        await invitation

        return [relDID, invitation]
    }

    async function receiveInvitation(data) {
        const relationship = new sdk.protocols.v1_0.Relationship(None, None, None, None, None)
        const relationshipKeys = new Promise((resolve) => {
            handlers.addHandler(relationship.msgFamily, relationship.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case relationship.msgNames.CREATED:
                        console.log(message)
                        const threadId = message['~thread'].thid
                        var relDID = message.did
                        const verKey = message.verKey
                        resolve([relDID, threadId])
                        break
                    case relationship.msgNames.CONNECTION_INVITATION:
                        resolve(message.inviteURL)
                }
            })
        })
        relationship.create(context)
        await relationshipKeys

        relDid = relationshipKeys[0]
        threadId = relationshipKeys[1]
        connection = sdk.protocols.v1_0.Connecting(relDid, "label", `https://vas.pps.evernym.com:443/agency/msg?c_i=${base64url.encode(JSON.stringify(data))}`)
        return [relDid, connection]
    }

    async function acceptInvitation(data, connection_id=None) {
        connecting = connectionsMap[connection_id]
        const connection = new Promise((resolve) => {
            handlers.addHandler(Connecting.msgFamily, Connecting.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case 'accept':
                        console.log(message)
                        break;
                    default: 
                        console.log(message)
                        break;
                }
                
            })
        })
        connecting.accept(context)
    }


    app.get('/agent/command/:topic', async function(req, res) {
        switch(req.params.topic) {
            case 'Connection': 
                handler = new connectionHandler()
                result = await handler.handleGetOperation(req.params.topic, id)
                res.setStatus(200).send(`"state":"${result}"}`)
        }
    })

    app.get('/agent/command/:topic/:id', async function(req, res) {
        id = req.params.id
        switch(req.params.topic) {
            case 'Connection': 
                handler = new connectionHandler()
                result = await handler.handleGetOperation(req.params.topic, id)
                res.setStatus(200).send(`"state":"${result}"}`)
        }
    })

    app.listen(LISTENING_PORT, () => {
        console.log(`Listening on port ${LISTENING_PORT}`)
    })
}

main()

