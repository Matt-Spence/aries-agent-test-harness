# Aries Interoperability Information


This web site shows the current status of Aries Interoperability between Aries frameworks and agents. While
not yet included in these results, we have a working prototype for testing Aries mobile wallets using the
same tests.

The latest interoperability test results are below. Each row is a test agent, its columns
the results of tests executed in combination with other test agents.
The last column ("All Tests") shows the results of all tests run for the given test agent in any role. The link on each test
agent name provides more details about results for all test combinations for that test agent. On
that page are links to a full history of the test runs and full details on every executed test. 

The following test agents are currently supported:

- [Aries Cloud Agent Python](https://github.com/hyperledger/aries-cloudagent-python) (ACA-Py)
- [Aries Framework Go](https://github.com/hyperledger/aries-framework-go) (AF-Go)
- [Aries Framework JavaScript](https://github.com/hyperledger/aries-framework-javascript) (AFJ)
- [Aries Framework .NET](https://github.com/hyperledger/aries-framework-dotnet) (AF-.NET)

Want to add your Aries component to this page? You need to add a runset to the
[Aries Agent Test Harness](https://github.com/hyperledger/aries-agent-test-harness).

## Latest Interoperability Results

| Test Agent | Scope | Exceptions | ACA-Py | AF-Go | AFJ | AF-.NET | **All Tests** |
| ----- | ----- | ----- | :----: | :----: | :----: | :----: | :----: |
| [ACA-Py](acapy.md)| AIP 1, 2 | None | 49 / 49<br>100% | 4 / 10<br>40% | 37 / 39<br>94% | 44 / 54<br>81% | **123 / 139<br>88%** |
| [AF-Go](afgo.md)| AIP 2 | None | 4 / 10<br>40% | 3 / 4<br>75% | 0 / 0<br>0% | 0 / 0<br>0% | **7 / 14<br>50%** |
| [AFJ](javascript.md)| AIP 1 | Revocation | 37 / 39<br>94% | 0 / 0<br>0% | 18 / 18<br>100% | 30 / 39<br>76% | **74 / 83<br>89%** |
| [AF-.NET](dotnet.md)| AIP 1 | Proof Proposal | 44 / 54<br>81% | 0 / 0<br>0% | 30 / 39<br>76% | 13 / 13<br>100% | **76 / 93<br>81%** |

- Where the row and column are the same Test Agent, the results include only the tests where the Test Agent plays ALL of the roles (ACME, Bob, Faber and Mallory)
- The results in the "All Tests" column include tests involving the "Test Agent" in ANY of the roles.
- Wondering what the results mean? Please read the brief [introduction to Aries interoperability](aries-interop-intro.md) for some background.
- Select the "Test Agent" links to drill down into the tests being run for each Test Agent.


*Results last updated: Sat Jun 19 03:57:21 UTC 2021*

