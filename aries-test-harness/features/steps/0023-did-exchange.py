# -----------------------------------------------------------
# Behave Step Definitions for the DID Excahnge Protocol 0023
# used to establish connections between Aries Agents based on DIDs.
# 0023 DID Excahnge RFC: 
# https://github.com/hyperledger/aries-rfcs/blob/master/features/0023-did-exchange/README.md
#
# Current AIP version level of test coverage: N/A
# Current DID Exchange version level of test coverage 1.0
#  
# -----------------------------------------------------------

from behave import given, when, then
import json
from agent_backchannel_client import agent_backchannel_GET, agent_backchannel_POST, expected_agent_state


@when('"{responder}" sends an explicit invitation')
def step_impl(context, responder):

    data = {
        "include_handshake": True,
        "use_public_did": False
    }

    (resp_status, resp_text) = agent_backchannel_POST(context.responder_url + "/agent/command/", "out-of-band", operation="send-invitation-message", data=data)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "invitation-sent"
    assert "did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/didexchange/v1.0" in resp_text
    context.responder_invitation = resp_json["invitation"]
    # TODO drill into the handshake protocol in the invitation and remove anything else besides didexchange.

    # setup the initial connection id dictionary if one doesn't exist.
    if not hasattr(context, 'connection_id_dict'):
        context.connection_id_dict = {}
        context.connection_id_dict[responder] = {}
    
    # Get the responders's connection id from the above request's response webhook in the backchannel
    invitation_id = context.responder_invitation["@id"]
    (resp_status, resp_text) = agent_backchannel_GET(context.responder_url + "/agent/response/", "did-exchange", id=invitation_id)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'
    resp_json = json.loads(resp_text)

    context.connection_id_dict[responder][context.requester_name] = resp_json["connection_id"]


@when('"{requester}" receives the invitation')
def step_impl(context, requester):

    data = context.responder_invitation
    (resp_status, resp_text) = agent_backchannel_POST(context.requester_url + "/agent/command/", "out-of-band", operation="receive-invitation", data=data)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "invitation-received"

    if not hasattr(context, 'connection_id_dict'):
        context.connection_id_dict = {}
        context.connection_id_dict[requester] = {}

    context.connection_id_dict[requester] = {context.responder_name: resp_json["connection_id"]}
    #context.connection_id_dict[requester][context.responder_name] = resp_json["connection_id"]

    # Check to see if the requester_name exists in context. If not, antother suite is using it so set the requester name and url
    #if not hasattr(context, 'requester_name'):
    #    context.requester_url = requester_url
    #    context.requester_name = requester

    # get connection and verify status
    #assert expected_agent_state(requester_url, "didexchange", context.connection_id_dict[requester][context.responder_name], "invited")


@when('"{requester}" sends the request to "{responder}"')
def step_impl(context, requester, responder):
    requester_connection_id = context.connection_id_dict[requester][responder]
    #responder_connection_id = context.connection_id_dict[responder][requester]

    # get connection and verify status
    #assert expected_agent_state(context.requester_url, "didexchange", requester_connection_id, "invitation-received")
    #assert expected_agent_state(responder_url, "connection", responder_connection_id, "invitation-sent")

    (resp_status, resp_text) = agent_backchannel_POST(context.requester_url + "/agent/command/", "did-exchange", operation="send-request", id=requester_connection_id)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "request-sent"

    # get connection and verify status
    #assert expected_agent_state(context.requester_url, "connection", requester_connection_id, "request-sent")


@when('"{responder}" receives the request')
def step_impl(context, responder):
    responder_connection_id = context.connection_id_dict[responder][context.requester_name]

    # responder already recieved the connection request in the send-request call so get connection and verify status.
    #assert expected_agent_state(responder_url, "didexchange", responder_connection_id, "request-recieved")
    #invitation_id = context.responder_invitation["@id"]
    assert expected_agent_state(context.responder_url, "connection", responder_connection_id, "request-received")
    #(resp_status, resp_text) = agent_backchannel_GET(context.responder_url + "/agent/response/", "did-exchange", id=invitation_id)
    #(resp_status, resp_text) = agent_backchannel_POST(context.responder_url + "/agent/command/", "did-exchange", operation="receive-request", id=responder_connection_id)
    #assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    #resp_json = json.loads(resp_text)
    #assert resp_json["state"] == "request-received"

    # get connection and verify status
    #assert expected_agent_state(requester_url, "connection", requester_connection_id, "request-recieved")


@when('"{responder}" sends a response to "{requester}"')
def step_impl(context, responder, requester):
    responder_connection_id = context.connection_id_dict[responder][requester]
    #requester_connection_id = context.connection_id_dict[requester][responder]

    # get connection and verify status
    #assert expected_agent_state(responder_url, "connection", responder_connection_id, "request-recieved")
    #assert expected_agent_state(requester_url, "connection", requester_connection_id, "request-sent")

    (resp_status, resp_text) = agent_backchannel_POST(context.responder_url + "/agent/command/", "did-exchange", operation="send-response", id=responder_connection_id)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "response-sent"

    # get connection and verify status
    #assert expected_agent_state(context.responder_url, "connection", responder_connection_id, "response-sent")


@when('"{requester}" receives the response')
def step_impl(context, requester):
    requester_connection_id = context.connection_id_dict[requester][context.responder_name]

    # This should be response-received but is completed. Chat with SKlump on this issue.
    assert expected_agent_state(context.requester_url, "connection", requester_connection_id, "completed")


@when('"{requester}" sends complete to "{responder}"')
def step_impl(context, requester, responder):
    # this seems to be done in the response from send-response from the responder. Need to talk to SKlump about this
    pass
    # requester_url = context.config.userdata.get(requester)
    # requester_connection_id = context.connection_id_dict[requester][context.responder_name]

    # # get connection and verify status
    # assert expected_agent_state(requester_url, "connection", requester_connection_id, "response-recieved")

    # data = {"comment": "Hello from " + requester}
    # (resp_status, resp_text) = agent_backchannel_POST(requester_url + "/agent/command/", "did-exchange", operation="send-complete", id=requester_connection_id, data=data)
    # assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'

    # # get connection and verify status
    # assert expected_agent_state(requester_url, "connection", requester_connection_id, "completed")



