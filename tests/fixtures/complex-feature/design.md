## Context

The complex-feature fixture represents a realistic multi-component feature that would be found in production codebases. It exercises ralph-run's ability to:
- Aggregate content from multiple spec files
- Handle complex task structures with sections
- Manage state across multiple task categories
- Generate comprehensive PRDs from multiple artifacts

The fixture models a "Multi-Feature Integration" that spans multiple system components with dependencies and interactions.

## Goals / Non-Goals

**Goals:**
1. Provide a realistic multi-spec OpenSpec change
2. Include complex task hierarchy with sections and subsections
3. Have varied task states (completed, in-progress, pending)
4. Include cross-references between artifacts
5. Test full range of ralph-run functionality

**Non-Goals:**
1. Do not implement actual features (this is test data only)
2. Do not require external systems or dependencies
3. Do not use advanced/corner-case OpenSpec features
4. Do not simulate production load or scale

## Decisions

### 1. Three Spec Files

**Decision:** Include exactly three spec files for different aspects of the feature.

**Rationale:**
- Tests PRD generation's ability to aggregate multiple specs
- Provides enough complexity without being overwhelming
- Covers different types of requirements (core, integration, testing)
- Mirrors real-world multi-component features

**Spec Organization:**
- `spec-one`: Core functionality requirements
- `spec-two`: Integration and API requirements
- `spec-three`: Testing and documentation requirements

### 2. Multi-Section Task Hierarchy

**Decision:** Organize tasks into multiple sections with subsections.

**Rationale:**
- Tests task parsing with nested structure
- Provides realistic task organization
- Allows testing of task state across sections
- Demonstrates proper markdown formatting

**Task Structure:**
```
## 1. Core Implementation
- [x] 1.1 Setup project structure
- [x] 1.2 Implement base classes
- [/] 1.3 Build core functionality

## 2. API Development
- [ ] 2.1 Design API interface
- [ ] 2.2 Implement API endpoints
- [ ] 2.3 Add input validation

## 3. Integration
- [ ] 3.1 Configure middleware
- [ ] 3.2 Setup database connections
- [ ] 3.3 Implement caching layer

## 4. Testing
- [ ] 4.1 Write unit tests
- [ ] 4.2 Write integration tests
- [ ] 4.3 Configure CI/CD pipeline

## 5. Documentation
- [ ] 5.1 Write API documentation
- [ ] 5.2 Create user guide
- [ ] 5.3 Update README
```

### 3. Varied Task States

**Decision:** Include tasks in all three states across different sections.

**Rationale:**
- Tests current task detection logic
- Tests completed task counting for state restoration
- Tests iteration calculation based on progress
- Provides realistic "in-progress" scenario

**State Distribution:**
- Section 1: Mostly completed (2/3 done)
- Section 2: No progress (0/3 done)
- Section 3-5: All pending (0/9 done)

### 4. Cross-References Between Artifacts

**Decision:** Include references to other artifacts in each file.

**Rationale:**
- Tests PRD generation's ability to preserve references
- Validates that artifacts are linked properly
- Demonstrates realistic documentation practices

**Reference Examples:**
- Design references proposal requirements
- Tasks reference design decisions
- Specs reference both proposal and design

### 5. Detailed Technical Design

**Decision:** Include comprehensive technical design with multiple sections.

**Rationale:**
- Tests PRD generation with large design documents
- Validates that design content is properly included
- Provides realistic technical documentation

**Design Sections:**
- Context and scope
- Architecture overview
- Component design
- Data flow
- Security considerations
- Performance considerations
- Deployment strategy

## Risks / Trade-offs

### Risk 1: Fixture Becomes Too Complex
[Risk] Complex fixture may be hard to maintain and update.

→ **Mitigation:** Keep content generic and focused on structure. Use clear patterns and avoid implementation-specific details.

### Trade-off 1: Complexity vs. Test Time
[Trade-off] More complex fixture may increase test execution time.

→ **Decision:** Accept trade-off. Test quality is more important than speed. Can optimize test execution separately.

## Migration Plan

### Deployment Steps:
1. Create complex-feature directory structure
2. Write proposal.md with multi-component feature description
3. Write design.md with detailed technical architecture
4. Write tasks.md with multi-section hierarchy
5. Create specs/ directory with three subdirectories
6. Write spec-one/spec.md with core functionality requirements
7. Write spec-two/spec.md with integration requirements
8. Write spec-three/spec.md with testing requirements

### Validation:
- All required files exist
- Multiple spec files are properly structured
- Tasks are organized into sections
- PRD generation includes all spec content
- Fixture can be used in integration tests

## Open Questions

1. **Question:** Should tasks include subtasks?
    - **Status:** Optional
    - **Decision:** Keep to sections for clarity

2. **Question:** Should specs reference each other?
    - **Status:** No
    - **Decision:** Keep specs independent

3. **Question:** Should design include diagrams?
    - **Status:** No
    - **Decision:** Use text descriptions only
