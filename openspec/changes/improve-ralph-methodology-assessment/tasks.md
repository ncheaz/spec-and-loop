## 1. Preparation

- [x] 1.1 Read the current P6 and P14 descriptions in `openspec/changes/evaluate-ralph-wiggum-methodology/methodology-principles-enumeration.md`
- [x] 1.2 Review the implementation evidence for P6 in `RALPH-METHODOLOGY-ASSESSMENT.md` (section 5, P6)
- [x] 1.3 Review the implementation evidence for P14 in `RALPH-METHODOLOGY-ASSESSMENT.md` (section 5, P14)
- [x] 1.4 Search the codebase for other references to P6 (iteration numbering) or P14 (artifact immutability)

## 2. Update P6 Description

- [x] 2.1 Update P6 description to clarify state-file-based iteration numbering persistence
- [x] 2.2 Add implementation details about restart behavior and state file continuity
- [x] 2.3 Reference the implementation paths: `lib/mini-ralph/runner.js:387-403` and `scripts/ralph-run.sh:846-882`
- [x] 2.4 Remove or qualify any claims about live task-count derivation

## 3. Update P14 Description

- [x] 3.1 Update P14 description to acknowledge convention-only artifact immutability
- [x] 3.2 Add implementation details explaining lack of runtime guards or enforcement
- [x] 3.3 Reference the implementation evidence showing no write paths to artifact files
- [x] 3.4 Clarify that immutability is maintained by convention, not enforcement

## 4. Verification

- [ ] 4.1 Verify updated P6 description accurately reflects actual implementation behavior
- [ ] 4.2 Verify updated P14 description accurately reflects actual implementation behavior
- [ ] 4.3 Check that changes maintain clarity and don't introduce new ambiguities
- [ ] 4.4 If other references to P6/P14 were found, update those as well
- [ ] 4.5 Confirm no code changes are needed (documentation-only change)

## 5. Review

- [ ] 5.1 Read through updated P6 and P14 descriptions
- [ ] 5.2 Ensure descriptions are concise but contain sufficient implementation detail
- [ ] 5.3 Confirm changes align with the design document decisions
