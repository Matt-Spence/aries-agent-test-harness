"use strict";
const minimist = require("minimist");
//Express
const axios = require('axios')
const express = require("express");
const sdk = require('@evernym/verity-sdk');
const shell = require('shelljs')
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
        console.log(`Unhandled message:`)
        console.log(message)
    }

    const handlers = new sdk.Handlers()
    handlers.setDefaultHandler(defaultHandler)
    console.log('set default handler')

    const connectionsMap = new Map()

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function attempt(func, attempts, param) {
        var i
        for(i = 0; i < attempts; i=i+1) {
            var result = await func(param)
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
                res.status(200).send(`{"connection_id": \"${result[0]}\", \"state\": \"N/A\", \"invitation\": ${JSON.stringify(result[1])}}`)
                break;
            case 'receive-invitation': 
                console.log('Verity does not support the Invitee Role')
                res.status(501).send(`Verity does not support the Invitee role`)
                break;
            case 'accept-invitation': 
                console.log('Verity does not support the Invitee Role')
                res.status(501).send(`Verity does not support the Invitee Role`)
                break;
            case 'accept-request':
                result = await acceptRequest(data, id)
                res.status(200).send(`{"state":"${result[0]}", "connection_id": \"${result[1]}\"}`)
                break;
            case 'send-ping':
                result = await sendPing(id);
                res.status(200).send(`{"state":"${result[0]}", "connection_id": \"${result[1]}\"}`)
                break;
            default: 
                console.log(`unimplemented operation: ${operation}`)
                res.status(501).send()
                break;
        }
    }

    app.post('/agent/command/:topic/:operation', async function(req, res) {
        switch(req.params.topic) {
            case 'connection':
                console.log(`Matched operation: ${req.params.operation}, id: ${JSON.parse(req.body).id}`)
                console.log(JSON.parse(req.body).data)
                await handleConnectionPostOperation(req.params.operation, JSON.parse(req.body).data, res, JSON.parse(req.body).id)
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
                        console.log(message)
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
                        console.log("Relationship Invitation:")
                        console.log(message)
                        resolve(message.inviteURL)
                        break
                }
            })
        })

        await relationship.connectionInvitation(context)
        let invitationUrl
        await createInvitation.then((value) => {
            invitationUrl = value
        })

        const invitation = base64url.decode(invitationUrl.split('c_i=')[1])

        console.log(`Invitation created`)
        console.log(invitation)

        const connection = new sdk.protocols.v1_0.Connecting(relDid, "label", invitationUrl)

        console.log(`Mapping connection promise to: ${relDid}`)
        connectionsMap.set(relDid, new Promise((resolve) => {
            handlers.addHandler(connection.msgFamily, connection.msgFamilyVersion, async (msgName, message) => {
                switch(msgName) {
                    case 'request-received':
                        console.log(message) 
                        break;
                    case 'response-sent':
                        console.log(message)
                        resolve(true)
                        break
                    default:
                        console.log(message)
                        resolve(false)
                        break
                }
            })
        }))

        return [relDid, invitation]
    }

    async function acceptRequest(data, id) {
        console.log(`Accepting Connection Request with id: ${id}`)
        console.log(typeof connectionsMap.get(id))
        if(connectionsMap.get(id) != null) {
            let result
            await connectionsMap.get(id).then((value) => {
                result = value
            })
            if(result) {   
                connectionsMap.set(id, new Promise((resolve) => {
                    handlers.addHandler('trust_ping', '1.0', async function(msgName, message) {
                        switch(msgName) {
                            case 'sent-response': 
                                console.log(message)
                                resolve(true)
                                break;
                            case 'default':
                                console.log(message)
                                resolve(false)
                                break;
                        }
                    })
                }))
                
                console.log(`Returning [\'N/A\', ${id}]`)
                return ['N/A', id]
            } 
            return ['Error', id]
        }
        console.log('Unable to retrieve connection promise')
        console.log(connectionsMap.get(id))
        
        return ['Error', id]
    }

    async function handleConnectionGetOperation(id=null) {
        // Connection state in verity protocols doesn't line up with expected states in AATH
        // Verity backchannel will not proceed if it doesn't recieve proper signal messages,
        // this will have to suffice as an inferred state 
        if(id != null) {
            return "N/A"
        }
        return "N/A"
    }

    async function sendPing(id) {
        let result
        setTimeout(async () => {
            await connectionsMap.get(id).then((value) => {
            result = value
            })
        }, 3000)

        if(result) {
            return ['complete', id]
        }

        return ['error', id]
    }


    app.get('/agent/command/:topic', async function(req, res) {
        switch(req.params.topic) {
            case 'connection': 
                console.log(`Matched topic: ${req.params.topic}`)
                result = await handleConnectionGetOperation()
                res.status(200).send(`"state":"${result}"}`)
                break;
            case 'status':
                console.log(`Matched topic: ${req.params.topic}`)
                var url = await getVerityUrl()
                var status = await checkVerity(url)
                if(status != null) {
                    res.status(200).send()
                }
                res.status(404).send()
                break;
            case 'version':
                console.log(`Matched topic: ${req.params.topic}`)
                res.status(200).send("1.0")
                break;
            default:
                console.log(`Unimplemented topic: ${req.params.topic}`)
                res.status(501).send('Verity ackchannel has not implemented this topic')

        }
    })

    app.get('/agent/command/:topic/:id', async function(req, res) {
        switch(req.params.topic) {
            case 'connection': 
                console.log(`Matched topic with id: ${req.params.topic}, ${req.params.id}`)
                const result = await handleConnectionGetOperation(req.params.id)
                res.status(200).send(`{"state":"${result}"}`)
        }
    })

    app.post('/webhook', async function(req, res) {
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

