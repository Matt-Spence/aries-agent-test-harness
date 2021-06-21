"use strict";
const minimist = require("minimist");
//Express
const axios = require('axios')
const bodyParser = require('body-parser')
const express = require("express");
const sdk = require('verity-sdk');
const shell = require('shelljs')
const ngrok = require('ngrok');
const base64url = require('base64url');

const WALLET_NAME = `Wallet-${Math.floor(Math.random() * (999999 - 100000) + 100000)}`;
const WALLET_KEY = `Key-${Math.floor(Math.random() * (999999 - 100000) + 100000)}`;

var context = null

async function main() {
    const cliArguments = minimist(process.argv.slice(2), {
        alias: {
            port: "p",
        },
        default: {
            port: 9020,
        },
    });

    console.log('Environment Variables:')
    console.log(process.env)

    const BACKCHANNEL_PORT = Number(cliArguments.port)
    const AGENT_PORT = BACKCHANNEL_PORT+1
    process.env.AGENT_PORT = AGENT_PORT

    var VERITY_URL = null

    var backchannel_url = `127.0.0.1:${BACKCHANNEL_PORT}`

    const app = express()
    app.use(express.text({
        type: function (_) {
          return 'text'
        }
    }))

    function defaultHandler (message) {
        console.log(`Unhandled message:${message}`)
    }

    const handlers = new sdk.Handlers()
    handlers.setDefaultHandler(defaultHandler)
    console.log('set default handler')

    const connectionsMap = {}

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function attempt(func, attempts, params = []) {
        var i
        for(i = 0; i < attempts; i=i+1) {
            var result = await func(params)
            if(result != null) {
                return result
            }
            await sleep(1000)
        }
        return null
    }
    async function getVerityUrl() {
        let result
        console.log('Retrieving Verity ngrok url')
        await axios.get('http://127.0.0.1:4040/api/tunnels', {timeout: 2})
            .then((response) => {
                result = response.data.tunnels[0].public_url
            }).catch((error) => {
                console.log('Could not get verity url')
                result = null
            })
        return result
    }

    async function provisionAgent () {
        // create initial Context
        VERITY_URL = await attempt(getVerityUrl, 10)
        console.log(`Provisioning agent with Verity at ${VERITY_URL}`)
        console.log('Creating Verity Context')
        console.log(`Wallet name: ${WALLET_NAME}`)
        console.log(`Wallet key: ${WALLET_KEY}`)
        const ctx = await sdk.Context.create(WALLET_NAME, WALLET_KEY, VERITY_URL, '')
        console.log(`context created:`)
        console.log(ctx)
        const provision = new sdk.protocols.v0_7.Provision(null, null)
        console.log('Provisioning new agent')
        try {
            const context = await provision.provision(ctx)
            console.log('Agent Provisioned')
            return context
        } catch (e) {
            console.log(e)
        }
    }

    async function updateEndpoint () {
        console.log(`Updating webhook endppoint to ${backchannel_url}/webhook`)
        context.endpointUrl = `${backchannel_url}/webhook`

        // request that verity application use specified webhook endpoint
        await new sdk.protocols.UpdateEndpoint().update(context)
    }

    async function handleConnectionPostOperation(operation, data, res, id=null) {
        var result
        switch (operation) {
            case 'create-invitation': 
                result = await createInvitation()
                console.log(`sending response: \n {"connection_id": \"${result[0]}\", \"state\": \"N/A\", \"invitation\": ${JSON.stringify(result[1])}}`)
                res.status(200).send(`{"connection_id": \"${result[0]}\", \"state\": \"N/A\", \"invitation\": ${JSON.stringify(result[1])}}`)
                break;
            case 'receive-invitation': 
                result = await receiveInvitation(data)
                console.log(`Mapping ${result[1]} to ${result[0]}`)
                connectionsMap[result[0]] = result[1]
                console.log(`sending response: \n {"state":"N/A"}`)
                res.status(200).send(`{"state":"N/A", "connection_id": \"${result[0]}\"}`)
                break;
            case 'accept-invitation': 
                result = await acceptInvitation(data, id)
                res.status(501).send()
                break;
            case 'send-ping':
                res.status(501).send()
                break;
                // return await sendPing();
            default: 
                res.status(501).send()
                break;
        }
    }

    app.post('/agent/command/:topic/:operation', async function(req, res) {
        switch(req.params.topic) {
            case 'connection':
                console.log(`Matched operation: ${req.params.operation}`)
                console.log(JSON.parse(req.body).data)
                await handleConnectionPostOperation(req.params.operation, JSON.parse(req.body).data, res, req.body.id)
                break;
            default:
                console.log(`Matched operation: ${req.params.operation}`)
                res.status(501).send()
                break;
        }
    })

    async function createInvitation() {
        const relationship = new sdk.protocols.v1_0.Relationship(null, null, null, null, null)
        const relationshipProtocol = new Promise((resolve) => {
            handlers.addHandler(relationship.msgFamily, relationship.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case relationship.msgNames.CREATED:
                        console.log(message)
                        // const threadId = message['~thread'].thid
                        const relDID = message.did
                        // const verKey = message.verKey
                        console.log(`relationship DID: ${relDID}`)
                        // console.log(`relationship verKey: ${message.verKey}`)
                        resolve(message.did)
                        break
                    case relationship.msgNames.CONNECTION_INVITATION:
                        resolve(message.inviteURL)
                        break
                }
            })
        })

        if(!context) {
            context = await provisionAgent()
        }
        await updateEndpoint()
        console.log("Backchannel webhook endpoint updated")

        console.log("creating relationsip")

        let relDid
        relationship.create(context)
        await relationshipProtocol.then((value) => {
            relDid = value
        })
        console.log(`relationship Did created: ${relDid}`)

        const createInvitation = new Promise((resolve) => {
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
        let invitation
        await createInvitation.then((value) => {
            invitation = value
        })

        console.log(`Invitation created`)
        console.log(invitation)

        return [relDid, invitation]
    }

    async function receiveInvitation(data) {
        console.log(`Recieved invitation: ${JSON.stringify(data)}`)
        const relationship = new sdk.protocols.v1_0.Relationship()
        const relationshipKeys = new Promise((resolve) => {
            handlers.addHandler(relationship.msgFamily, relationship.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case relationship.msgNames.CREATED:
                        console.log(message)
                        var relDID = message.did
                        resolve(relDID)
                        break
                    case relationship.msgNames.CONNECTION_INVITATION:
                        resolve(message.inviteURL)
                }
            })
        })
        await relationship.create(context)
        console.log('relationship created')
        let relDid
        await relationshipKeys.then((result) => {
            relDid = result
        })

        const inviteUrl = `${VERITY_URL}:${AGENT_PORT}/agency/msg?c_i=${base64url.encode(JSON.stringify(data))}`
        console.log(`Generated Invite Url: ${inviteUrl}`)
        await axios.get(inviteUrl, {timeout: 2}).then((response) => {
            console.log("Retrieved data from invite url:")
            console.log(response.data)
        }).catch((error) => {
            console.log(`Error retrieving invite from inviteUrl`)
        })
        return [relDid, inviteUrl]
    }

    async function acceptInvitation(data, connection_id=null) {
        console.log(`Accepting invitation request, data parameter: ${data}`)
        const invitation = connectionsMap[connection_id]
        const connectionProtocol = new sdk.protocols.v1_0.Connecting(connection_id, "label", invitation)
        const connection = new Promise((resolve) => {
            handlers.addHandler(connectionProtocol.msgFamily, connectionProtocol.msgFamilyVersion, async (msgName, message) => {
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
        await connectionProtocol.accept(context)
        await connection
    }

    async function handleConnectionGetOperation(id=null) {
        // TODO: See if there's a way to get the status of a specific verity agent. Might not be practical

        if(id != null) {
            return "N/A"
        }
        return "N/A"
    }


    app.get('/agent/command/:topic', async function(req, res) {
        switch(req.params.topic) {
            case 'connection': 
                console.log(`Matched operaiton: ${req.params.topic}`)
                result = await handleConnectionGetOperation()
                res.status(200).send(`"state":"${result}"}`)
                break;
            case 'status':
                console.log(`Matched operaiton: ${req.params.topic}`)
                var url = await attempt(getVerityUrl, 10)
                var status = await attempt(checkVerity, 1, [url])
                if(status != null) {
                    res.status(200).send()
                }
                res.status(404).send()
                break;
            case 'version':
                console.log(`Matched operaiton: ${req.params.topic}`)
                res.status(200).send("1.0")
                break;
            default:
                console.log(`Unimplemented operation: ${req.params.topic}`)
                res.status(501).send()

        }
    })

    app.get('/agent/command/:topic/:id', async function(req, res) {
        switch(req.params.topic) {
            case 'connection': 
                console.log(`Matched operaiton: ${req.params.topic}, ${req.params.id}`)
                const result = await handleConnectionGetOperation(req.params.id)
                res.status(200).send(`{"state":"${result}"}`)
        }
    })

    app.post('/webhook', async function(req, res) {
        console.log(`webhook recieved request:`)
        console.log(req.body)
        await handlers.handleMessage(context, Buffer.from(req.body, 'utf8'))
        res.status(200).send(`success`)
    });

    app.listen(BACKCHANNEL_PORT, () => {
        console.log(`Verity Backchannel listening on port ${BACKCHANNEL_PORT}`)
    })

    async function checkVerity(url=`http://localhost:${AGENT_PORT}/agency`) {
        console.log(`Checking for process listening on port ${AGENT_PORT}`)
        const result = await shell.exec(`netstat -tulp | grep \'${AGENT_PORT}\'`).stdout
        console.log(result)
        return (result != "") ? true : null
    }

    shell.exec('./entrypoint.sh', {async:true})
}

main()

