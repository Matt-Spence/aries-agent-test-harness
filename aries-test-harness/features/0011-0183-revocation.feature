Feature: Aries agent credential revocation and revocation notification RFC 0011 0183

   Background: create a schema and credential definition in order to issue a credential
      Given "Acme" has a public did
      And "Acme" is ready to issue a credential

   @T001-RFC0011 @RFC0011 @P1 @critical @AcceptanceTest @Schema_DriversLicense_Revoc @Indy
   Scenario Outline: Credential revoked by Issuer and Holder attempts to prove
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      When <issuer> revokes the credential
      And "Faber" sends a <request_for_proof> presentation to "Bob"
      And "Bob" makes the <presentation> of the proof
      And "Faber" acknowledges the proof
      Then "Bob" has the proof unverified

      Examples:
         | issuer | credential_data   | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MaxValues | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T002-RFC0011 @RFC0011 @P1 @critical @AcceptanceTest @Schema_DriversLicense_Revoc @Indy @allure.lable.owner:me
   Scenario Outline: Credential revoked and replaced with a new updated credential, holder proves claims with the updated credential
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      When <issuer> revokes the credential
      And <issuer> issues a new credential to "Bob" with <new_credential_data>
      And "Faber" sends a <request_for_proof> presentation to "Bob"
      And "Bob" makes the <presentation> of the proof
      And "Faber" acknowledges the proof
      Then "Bob" has the proof verified

      Examples:
         | issuer | credential_data   | new_credential_data | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MinValues | Data_DL_MaxValues   | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T003-RFC0011 @RFC0011 @P2 @normal @AcceptanceTest @Schema_DriversLicense_Revoc @Indy
   Scenario Outline: Proof in process while Issuer revokes credential before presentation
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      When "Faber" sends a <request_for_proof> presentation to "Bob"
      And <issuer> revokes the credential
      And "Bob" makes the <presentation> of the proof
      And "Faber" acknowledges the proof
      Then "Bob" has the proof unverified

      Examples:
         | issuer | credential_data   | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MaxValues | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T004-RFC0011 @RFC0011 @P2 @normal @AcceptanceTest @ExceptionTest @Schema_DriversLicense_Revoc @Indy @delete_cred_from_wallet @wip
   Scenario Outline: Credential revoked and replaced with a new updated credential, holder proves claims with the updated credential but presents the revoked credential
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      When <issuer> revokes the credential
      And <issuer> issues a new credential to "Bob" with <new_credential_data>
      And "Faber" sends a <request_for_proof> presentation to "Bob"
      And "Bob" makes the <presentation> of the proof with the revoked credential
      And "Faber" acknowledges the proof
      Then "Bob" has the proof verified

      Examples:
         | issuer | credential_data   | new_credential_data | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MinValues | Data_DL_MaxValues   | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T005-RFC0011 @RFC0011 @P2 @normal @AcceptanceTest @Schema_DriversLicense_Revoc @Indy
   Scenario Outline: Credential is revoked inside the timeframe
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      And <issuer> has revoked the credential within <timeframe>
      When "Faber" sends a <request_for_proof> presentation to "Bob" with credential validity during <timeframe>
      And "Bob" makes the <presentation> of the proof with the revoked credential
      And "Faber" acknowledges the proof
      Then "Bob" has the proof unverified

      Examples:
         | issuer | credential_data   | timeframe       | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MinValues | -86400:+86400   | proof_request_DL_revoc_address | presentation_DL_revoc_address |
         | Acme   | Data_DL_MinValues | -604800:now       | proof_request_DL_revoc_address | presentation_DL_revoc_address |
         | Acme   | Data_DL_MinValues | -604800:+604800 | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T006-RFC0011 @RFC0011 @P2 @normal @AcceptanceTest @Schema_DriversLicense_Revoc @Indy
   Scenario Outline: Credential is revoked before the timeframe
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      And <issuer> has revoked the credential before <timeframe>
      When "Faber" sends a <request_for_proof> presentation to "Bob" with credential validity before <timeframe>
      And "Bob" makes the <presentation> of the proof with the revoked credential
      And "Faber" acknowledges the proof
      Then "Bob" has the proof unverified

      Examples:
         | issuer | credential_data   | timeframe  | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MaxValues | 0:+86400   | proof_request_DL_revoc_address | presentation_DL_revoc_address |
         | Acme   | Data_DL_MinValues | -1:+604800 | proof_request_DL_revoc_address | presentation_DL_revoc_address |
         | Acme   | Data_DL_MinValues | now:now    | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T007-RFC0011 @RFC0011 @P2 @normal @AcceptanceTest @Schema_DriversLicense_Revoc @Indy @wip @NeedsReview
   Scenario Outline: Credential is revoked after the timeframe 
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      And <issuer> has revoked the credential after <timeframe>
      When "Faber" sends a <request_for_proof> presentation to "Bob" with credential validity after <timeframe>
      And "Bob" makes the <presentation> of the proof with the revoked credential
      And "Faber" acknowledges the proof
      Then "Bob" has the proof verified

      Examples:
         | issuer | credential_data   | timeframe | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MaxValues | -60:-30   | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T008-RFC0011 @RFC0011 @P2 @normal @DerivedTest @Schema_DriversLicense_Revoc @wip @Indy
   Scenario Outline: Credential is revoked during a timeframe with an open ended FROM or TO date
      Given "2" agents
         | name  | role     |
         | Bob   | prover   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from <issuer> with <credential_data>
      And <issuer> has revoked the credential within <timeframe>
      When "Faber" sends a <request_for_proof> presentation to "Bob" with credential validity during <timeframe>
      And "Bob" makes the <presentation> of the proof with the revoked credential
      And "Faber" acknowledges the proof
      Then "Bob" has the proof unverified

      Examples:
         | issuer | credential_data   | timeframe | request_for_proof              | presentation                  |
         | Acme   | Data_DL_MinValues | :now      | proof_request_DL_revoc_address | presentation_DL_revoc_address |
         | Acme   | Data_DL_MinValues | now:      | proof_request_DL_revoc_address | presentation_DL_revoc_address |


   @T009-RFC0011 @RFC0011 @P3 @DerivedTest @NegativeTest @Schema_DriversLicense_Revoc @wip @NeedsReview
   Scenario Outline: Revoke attempt be done by the holder or a verifier
      Given "3" agents
         | name  | role     |
         | Acme  | issuer   |
         | Bob   | holder   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from "Acme" with <credential_data>
      When <role> revokes the credential
      Then <role> will get an error stating ...
      And "Bob" can make a proof with the credential

      Examples:
         | issuer | credential_data   | role     | request_for_proof        | presentation            |
         | Acme   | Data_DL_MaxValues | holder   | proof_request_DL_address | presentation_DL_address |
         | Acme   | Data_DL_MaxValues | verifier | proof_request_DL_address | presentation_DL_address |


   @T010-RFC0011 @RFC0011 @P3 @DerivedTest @NegativeTest @Schema_DriversLicense @wip @NeedsReview
   Scenario Outline: Attempt to revoke an unrevokable credential.
      Given "3" agents
         | name  | role     |
         | Acme  | issuer   |
         | Bob   | holder   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from "Acme" with <credential_data>
      When "Acme" revokes the credential
      Then "Acme" receives an error stating …
      And "Bob" can make a proof with the credential

      Examples:
         | issuer | credential_data   | request_for_proof        | presentation            |
         | Acme   | Data_DL_MinValues | proof_request_DL_address | presentation_DL_address |


   @T011-RFC0011 @RFC0011 @P2 @AcceptanceTest @Schema_DriversLicense_Revoc @wip @NeedsReview
   Scenario Outline: Issuer revokes multiple credentials in the same transaction
      Given "3" agents
         | name  | role     |
         | Acme  | issuer   |
         | Bob   | holder   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from "Acme" with <credential_data>
      And "Faber" has an issued credential from "Acme" with <credential_data_2>
      When "Acme" revokes "Bob’s" credential
      And "Acme" revokes "Faber’s" credential
      Then "Bob" cannot make a proof with the credential
      And "Faber" cannot make a proof with the credential

      Examples:
         | issuer | credential_data   | request_for_proof        | presentation            |
         | Acme   | Data_DL_MaxValues | proof_request_DL_address | presentation_DL_address |


   @T001-RFC0183 @RFC0183 @P1 @AcceptanceTest @Schema_DriversLicense_Revoc @wip @NeedsReview
   Scenario Outline: Issuer revokes a credential and then sends notification
      Given "3" agents
         | name  | role     |
         | Acme  | issuer   |
         | Bob   | holder   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from "Acme" with <credential_data>
      When "Acme" revokes the credential
      And "Acme" sends a revocation notification
      Then "Bob" receives the revocation notification
      And "Bob" cannot make a proof with the credential

      Examples:
         | issuer | credential_data   | request_for_proof        | presentation            |
         | Acme   | Data_DL_MaxValues | proof_request_DL_address | presentation_DL_address |

   @T002-RFC0183 @RFC0183  @P2 @AcceptanceTest @Schema_DriversLicense_Revoc @wip @NeedsReview
   Scenario Outline: Issuer revokes multiple credentials for multiple holders and sends notification
      Given "3" agents
         | name  | role     |
         | Acme  | issuer   |
         | Bob   | holder   |
         | Faber | verifier |
      And "Faber" and "Bob" have an existing connection
      And "Bob" has an issued credential from "Acme" with <credential_data>
      And “Faber” has an issued credential from "Acme" with <credential_data_2>
      When "Acme" revokes "Bob’s" credential
      And "Acme" sends a revocation notification to "Bob"
      And "Acme" revokes "Faber’s" credential
      And "Acme" sends a revocation notification to "Faber"
      Then "Bob" receives the revocation notification
      And "Faber" receives the revocation notification
      And "Bob" cannot make a proof with the credential
      And "Faber" cannot make a proof with the credential

      Examples:
         | issuer | credential_data   | request_for_proof        | presentation            |
         | Acme   | Data_DL_MaxValues | proof_request_DL_address | presentation_DL_address |
