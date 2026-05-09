# Tasks

## 1. Supervisor Integration

- [ ] 1.1 **Prepare the task body for supervisor integration coverage**
  - Scope: `openspec/changes/supervisor-demo-change/tasks.md`, `tests/fixtures/supervisor/integration/mock-opencode.js`
  - Change: Keep the task strict-valid before the mocked supervisor rewrites it during integration tests.
  - Done when:
    - `npx openspec validate supervisor-demo-change --strict` exits 0
    - the mocked supervisor can replace this task body with another strict-valid body
    - the mocked implementer can mark the patched task complete on the next iteration
  - Stop and hand off if:
    - the integration harness can no longer produce a strict-valid supervisor patch for this fixture
