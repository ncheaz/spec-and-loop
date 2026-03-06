## Context

The simple-feature fixture is designed to be a minimal, self-contained test case for integration testing. It should represent the simplest possible valid OpenSpec change while still exercising all major functionality paths in ralph-run.

The fixture will be used by integration tests to verify:
- Change detection and validation
- PRD generation from OpenSpec artifacts
- Task parsing and tracking
- Ralph loop initialization
- Symlink architecture

## Goals / Non-Goals

**Goals:**
1. Provide a minimal valid OpenSpec change structure
2. Include all required artifact types (proposal, design, tasks, specs)
3. Have enough tasks to test state management (completed, in-progress, pending)
4. Use realistic but simple content
5. Be easy to understand and modify

**Non-Goals:**
1. Do not implement any actual features (this is test data only)
2. Do not include complex multi-file scenarios
3. Do not use advanced OpenSpec features
4. Do not require external dependencies or special setup

## Decisions

### 1. Minimal Task Set (3 tasks)

**Decision:** Include exactly 3 tasks in the fixture.

**Rationale:**
- One completed task to test state restoration
- One in-progress task to test current task detection
- One pending task to test iteration progression
- Small enough to be easily understood
- Large enough to test all task states

**Task Structure:**
```
- [x] 1.1 Initialize project structure
- [/] 1.2 Implement core functionality
- [ ] 1.3 Write tests and documentation
```

### 2. Single Spec File

**Decision:** Include exactly one spec file with basic requirements.

**Rationale:**
- Demonstrates spec reading functionality
- Keeps fixture simple and focused
- All tests can work with single-spec scenario
- Multi-spec scenarios are covered by other fixtures

**Spec Content:**
- Basic "ADDED Requirements" section
- 2-3 simple testable requirements
- Clear scenario descriptions

### 3. Realistic but Simple Content

**Decision:** Use generic placeholder content that describes a hypothetical feature.

**Rationale:**
- Tests shouldn't depend on specific implementation details
- Makes fixture reusable across different test scenarios
- Avoids coupling tests to specific features

**Content Approach:**
- Describe a generic "simple feature" with basic requirements
- Use placeholder names like "SimpleFeature" or "TestComponent"
- Focus on structure over content

### 4. Include All Required Artifacts

**Decision:** Fixture must include proposal.md, design.md, tasks.md, and at least one spec.

**Rationale:**
- Validates that ralph-run correctly checks for all required files
- Ensures PRD generation works with complete artifact set
- Matches the structure of real OpenSpec changes

## Risks / Trade-offs

### Risk 1: Fixture Becomes Outdated
[Risk] As OpenSpec evolves, the fixture structure may become invalid.

→ **Mitigation:** Keep fixture minimal and update when schema changes. Use fixture creation tests to validate structure.

### Trade-off 1: Simplicity vs. Coverage
[Trade-off] Simple fixture may not exercise all edge cases.

→ **Decision:** Accept this trade-off. Complex scenarios are covered by other fixtures (complex-feature, incomplete-change).

## Migration Plan

### Deployment Steps:
1. Create simple-feature directory structure
2. Write proposal.md with clear description
3. Write design.md with basic technical approach
4. Write tasks.md with 3 representative tasks
5. Create specs/simple-feature/ directory
6. Write spec.md with basic requirements

### Validation:
- All required files exist
- Files follow OpenSpec schema
- Tasks have proper checkbox formatting
- Spec file has valid markdown structure
- Fixture can be used in integration tests

## Open Questions

1. **Question:** Should the fixture include actual code examples?
    - **Status:** No - keep as documentation-only
    - **Decision:** Use placeholder descriptions instead

2. **Question:** Should tasks include subtasks?
    - **Status:** No - keep flat for simplicity
    - **Decision:** Subtasks tested in other fixtures

3. **Question:** Should design include code snippets?
    - **Status:** No - keep conceptual
    - **Decision:** Focus on structure, not implementation
