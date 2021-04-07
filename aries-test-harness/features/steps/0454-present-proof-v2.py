from behave import *
import json
from agent_backchannel_client import agent_backchannel_GET, agent_backchannel_POST, expected_agent_state
from agent_test_utils import get_relative_timestamp_to_epoch
from time import sleep


@when('"{verifier}" sends a {request_for_proof} presentation to "{prover}"')
def step_impl(context, verifier, request_for_proof, prover):
    try:
        request_for_proof_json_file = open('features/data/' + request_for_proof + '.json')
        request_for_proof_json = json.load(request_for_proof_json_file)
        context.request_for_proof = request_for_proof_json["presentation_proposal"]

    except FileNotFoundError:
        print(FileNotFoundError + ': features/data/' + request_for_proof + '.json')

    # Call the step below to get send rhe request for presentation.
    context.execute_steps('''
        When "''' + verifier + '''" sends a request for proof presentation to "''' + prover + '''"
    ''')

@when('"{prover}" makes the presentation of the proof')
def step_impl(context, prover):
    prover_url = context.prover_url

    if "presentation" in context:
        presentation = context.presentation
        # Find the cred ids and add the actual cred id into the presentation
        # TODO: There is probably a better way to get access to the specific requested attributes and predicates. Revisit this later.
        try:
            for i in range(json.dumps(presentation["requested_attributes"]).count("cred_id")):
                # Get the schema name from the loaded presentation for each requested attributes
                cred_type_name = presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["cred_type_name"]
                presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["cred_id"] = context.credential_id_dict[cred_type_name][len(context.credential_id_dict[cred_type_name])-1]
                # If there is a timestamp, calculate it from the instruction in the file. Can be 'now' or + - relative to now.
                if ("timestamp" in presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]):
                    relative_timestamp = presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["timestamp"]
                    presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["timestamp"] = get_relative_timestamp_to_epoch(relative_timestamp)
                # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
                presentation["requested_attributes"][list(presentation["requested_attributes"])[i]].pop("cred_type_name")
        except KeyError:
            pass
        
        try:
            for i in range(json.dumps(presentation["requested_predicates"]).count("cred_id")):
                # Get the schema name from the loaded presentation for each requested predicates
                cred_type_name = presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_type_name"]
                presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_id"] = context.credential_id_dict[cred_type_name][len(context.credential_id_dict[cred_type_name])-1] 
                # If there is a timestamp, calculate it from the instruction in the file. Can be 'now' or + - relative to now.
                if ("timestamp" in presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]):
                    relative_timestamp = presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["timestamp"]
                    presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["timestamp"] = get_relative_timestamp_to_epoch(relative_timestamp)
                # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
                presentation["requested_predicates"][list(presentation["requested_predicates"])[i]].pop("cred_type_name")
        except KeyError:
            pass

    else:   
        presentation = {
            "comment": "This is a comment for the send presentation.",
            "requested_attributes": {
                "attr_1": {
                    "revealed": True,
                    "cred_id": context.credential_id_dict[context.schema['schema_name']][len(context.credential_id_dict[context.schema['schema_name']])-1]
                }
            }
        }

    # if this is happening connectionless, then add the service decorator to the presentation
    if ('connectionless' in context) and (context.connectionless == True):
        presentation["~service"] = {
                "recipientKeys": [
                    context.presentation_exchange_id
                ],
                "routingKeys": None,
                "serviceEndpoint": context.verifier_url
            }

    (resp_status, resp_text) = agent_backchannel_POST(prover_url + "/agent/command/", "proof", operation="send-presentation", id=context.presentation_thread_id, data=presentation)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'
    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "presentation-sent"

    # check the state of the presentation from the verifier's perspective
    assert expected_agent_state(context.verifier_url, "proof", context.presentation_thread_id, "presentation-received", wait_time=60.0)

@when('"{prover}" makes the {presentation} of the proof')
def step_impl(context, prover, presentation):
    try:
        presentation_json_file = open('features/data/' + presentation + '.json')
        presentation_json = json.load(presentation_json_file)
        context.presentation = presentation_json["presentation"]

    except FileNotFoundError:
        print(FileNotFoundError + ': features/data/' + presentation + '.json')

    # Call the step below to get send rhe request for presentation.
    context.execute_steps('''
        When "''' + prover + '''" makes the presentation of the proof
    ''')

@when('"{verifier}" acknowledges the proof')
def step_impl(context, verifier):
    verifier_url = context.verifier_url

    (resp_status, resp_text) = agent_backchannel_POST(verifier_url + "/agent/command/", "proof", operation="verify-presentation", id=context.presentation_thread_id)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'
    resp_json = json.loads(resp_text)
    assert resp_json["state"] == "done"

    if "support_revocation" in context:
        if context.support_revocation:
            # Add the verified property returned to the credential verification dictionary to check in subsequent steps. Key by presentation thread id
            if "credential_verification_dict" in context:
                context.credential_verification_dict[context.presentation_thread_id] = resp_json["verified"]
            else:
                context.credential_verification_dict = {context.presentation_thread_id: resp_json["verified"]}

@then('"{prover}" has the proof verified')
def step_impl(context, prover):
    # check the state of the presentation from the prover's perspective
    assert expected_agent_state(context.prover_url, "proof", context.presentation_thread_id, "done")

    # Check the status of the verification in the verify-presentation call. Should be True
    if 'credential_verification_dict' in context:
        assert context.credential_verification_dict[context.presentation_thread_id] == "true"

@given('"{verifier}" and "{prover}" do not have a connection')
def step_impl(context, verifier, prover):
    context.connectionless = True

@when('"{prover}" doesn’t want to reveal what was requested so makes a presentation proposal')
def step_impl(context, prover):
   
    # check for a schema template already loaded in the context. If it is, it was loaded from an external Schema, so use it.
    if "presentation_proposal" in context:
        data = context.presentation_proposal
    else:   
        data = {
            "requested_attributes": [
                {
                    "name": "attr_2",
                    "cred_def_id": context.credential_definition_id_dict[context.schema["schema_name"]],
                }
            ]
        }
    if data.get("requested_attributes") == None:
        requested_attributes = []
    else:
        requested_attributes = data["requested_attributes"]
    if data.get("requested_predicates") == None:
        requested_predicates = []
    else:
        requested_predicates = data["requested_predicates"]

    presentation_proposal = {
        "presentation_proposal": {
            "@type": "did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/present-proof/1.0/presentation-preview",
            "comment": "This is a comment for the presentation proposal.",
            "requested_attributes": requested_attributes,
            "requested_predicates": requested_predicates
        }
    }

    if ('connectionless' not in context) or (context.connectionless != True):
        presentation_proposal["connection_id"] = context.connection_id_dict[prover][context.verifier_name]

    # send presentation proposal
    (resp_status, resp_text) = agent_backchannel_POST(context.prover_url + "/agent/command/", "proof", operation="send-proposal", data=presentation_proposal)
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'
    resp_json = json.loads(resp_text)
    # check the state of the presentation from the verifiers perspective
    assert resp_json["state"] == "proposal-sent"

    # save off anything that is returned in the response to use later?
    context.presentation_thread_id = resp_json["thread_id"]

    # check the state of the presentation from the provers perspective
    assert expected_agent_state(context.verifier_url, "proof", context.presentation_thread_id, "proposal-received")


@when(u'"{verifier}" agrees to continue so sends a request for proof presentation')
def step_impl(context, verifier):
    # Construct the presentation request from the presention proposal.
    # This should be removed in V2.0 since data is not required with a thread id.
    data = {
        "requested_attributes": {
            "attr_2": {
                "name": "attr_2",
                "restrictions": [
                    {
                        "schema_name": "test_schema." + context.issuer_name,
                        "schema_version": "1.0.0"
                    }
                ]
            }
        }
    }

    presentation_request = {
            "presentation_proposal": {
                "@type": "did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/present-proof/1.0/request-presentation",
                "comment": "This is a comment for the request for presentation.",
                "request_presentations~attach": {
                    "@id": "libindy-request-presentation-0",
                    "mime-type": "application/json",
                    "data":  data
                }
            }
        }

    if ('connectionless' not in context) or (context.connectionless != True):
        presentation_request["connection_id"] = context.connection_id_dict[verifier][context.prover_name]
    
    # send presentation request
    (resp_status, resp_text) = agent_backchannel_POST(context.verifier_url + "/agent/command/", "proof", operation="send-request", id=context.presentation_thread_id, data=presentation_request)
    
    assert resp_status == 200, f'resp_status {resp_status} is not 200; {resp_text}'
    resp_json = json.loads(resp_text)
    # check the state of the presentation from the verifiers perspective
    assert resp_json["state"] == "request-sent"

    # save off anything that is returned in the response to use later?
    #context.presentation_thread_id = resp_json["thread_id"]

    # check the state of the presentation from the provers perspective
    assert expected_agent_state(context.prover_url, "proof", context.presentation_thread_id, "request-received")
    #assert present_proof_status(context.prover_url, context.presentation_thread_id, "request-received")

@when('"{prover}" doesn’t want to reveal what was requested so makes a {proposal}')
@when('"{prover}" makes a {proposal} to "{verifier}"')
def step_impl(context, prover, proposal, verifier=None):
    try:
        proposal_json_file = open('features/data/' + proposal + '.json')
        proposal_json = json.load(proposal_json_file)
        context.presentation_proposal = proposal_json["presentation_proposal"]

        # replace the cred_def_id with the actual id based on the cred type name
        try:
            for i in range(json.dumps(context.presentation_proposal["requested_attributes"]).count("cred_def_id")):
                # Get the cred type name from the loaded presentation for each requested attributes
                cred_type_name = context.presentation_proposal["requested_attributes"][i]["cred_type_name"]
                context.presentation_proposal["requested_attributes"][i]["cred_def_id"] = context.credential_definition_id_dict[cred_type_name]
                # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
                context.presentation_proposal["requested_attributes"][i].pop("cred_type_name")
        except KeyError:
            pass
        
        try:
            for i in range(json.dumps(context.presentation_proposal["requested_predicates"]).count("cred_def_id")):
                # Get the schema name from the loaded presentation for each requested predicates
                cred_type_name = context.presentation_proposal["requested_predicates"][i]["cred_type_name"]
                context.presentation_proposal["requested_predicates"][i]["cred_def_id"] = context.credential_definition_id_dict[cred_type_name] 
                # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
                context.presentation_proposal["requested_predicates"][i].pop("cred_type_name")
        except KeyError:
            pass

    except FileNotFoundError:
        print(FileNotFoundError + ': features/data/' + proposal + '.json')

    # Call the existing proposal step to make the proposal.
    context.execute_steps('''
        When "''' + prover + '''" doesn’t want to reveal what was requested so makes a presentation proposal
    ''')


#
# Step Definitions to complete the presentation rejection test scenario - T005-AIP10-RFC0037
#
@when(u'"{prover}" makes the {presentation} of the proof incorrectly so "{verifier}" rejects the proof')
def step_impl(context, prover, presentation, verifier):
    try:
        presentation_json_file = open('features/data/' + presentation + '.json')
        presentation_json = json.load(presentation_json_file)
        context.presentation = presentation_json["presentation"]

    except FileNotFoundError:
        print(FileNotFoundError + ': features/data/' + presentation + '.json')

    presentation = context.presentation
    # Find the cred ids and add the actual cred id into the presentation
    # try:
    #     for i in range(json.dumps(presentation["requested_attributes"]).count("cred_id")):
    #         # Get the schema name from the loaded presentation for each requested attributes
    #         cred_type_name = presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["cred_type_name"]
    #         #presentation["requested_attributes"][list(presentation["requested_attributes"])[i]]["cred_id"] = context.credential_id_dict[cred_type_name]
    #         presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_id"] = '0' 
    #         # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
    #         presentation["requested_attributes"][list(presentation["requested_attributes"])[i]].pop("cred_type_name")
    # except KeyError:
    #     pass
    
    # try:
    #     for i in range(json.dumps(presentation["requested_predicates"]).count("cred_id")):
    #         # Get the schema name from the loaded presentation for each requested predicates
    #         cred_type_name = presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_type_name"]
    #         #presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_id"] = context.credential_id_dict[cred_type_name]
    #         presentation["requested_predicates"][list(presentation["requested_predicates"])[i]]["cred_id"] = '1' 
    #         # Remove the cred_type_name from this part of the presentation since it won't be needed in the actual request.
    #         presentation["requested_predicates"][list(presentation["requested_predicates"])[i]].pop("cred_type_name")
    # except KeyError:
    #     pass

    # Change something in the presentation data to cause a problem report


    (resp_status, resp_text) = agent_backchannel_POST(context.prover_url + "/agent/command/", "proof", operation="send-presentation", id=context.presentation_thread_id, data=presentation)
    assert resp_status == 400, f'resp_status {resp_status} is not 400; {resp_text}'

    # check the state of the presentation from the verifier's perspective
    assert expected_agent_state(context.verifier_url, "proof", context.presentation_thread_id, "presentation-received")

    # context.execute_steps('''
    #     When "''' + prover + '''" makes the ''' + presentation + ''' of the proof
    # ''')

# @when(u'"{verifier}" rejects the proof so sends a presentation rejection')
# def step_impl(context, verifier):
#     pass
#     #raise NotImplementedError(u'STEP: When "Faber" rejects the proof so sends a presentation rejection')

@then(u'"{prover}" has the proof unverified')
def step_impl(context, prover):
    # check the state of the presentation from the prover's perspective
    # in the unacknowledged case, the state of the prover is still done. There probably should be something else to check.
    # like having the verified: false in the repsonse. Change this if agents start to report the verified state. 
    assert expected_agent_state(context.prover_url, "proof", context.presentation_thread_id, "done")

    # Check the status of the verification in the verify-presentation call. Should be False
    if 'credential_verification_dict' in context:
        assert context.credential_verification_dict[context.presentation_thread_id] == "false"