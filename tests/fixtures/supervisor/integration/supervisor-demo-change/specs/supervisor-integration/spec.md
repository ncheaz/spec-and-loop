## ADDED Requirements

### Requirement: Supervisor integration fixture exists

The repository SHALL ship a minimal strict-valid OpenSpec change that the supervisor integration tests can copy into a temporary workspace.

#### Scenario: The fixture validates strictly

- **WHEN** `npx openspec validate supervisor-demo-change --strict` runs inside a workspace containing this fixture
- **THEN** the validator SHALL accept the change artifacts without schema errors
