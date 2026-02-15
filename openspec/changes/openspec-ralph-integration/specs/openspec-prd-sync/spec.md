## ADDED Requirements

### Requirement: Convert OpenSpec artifacts to PRD format
The system SHALL convert OpenSpec artifacts (proposal.md, specs/*/*.md, design.md) into a PRD format consumable by open-ralph-wiggum.

#### Scenario: Successful PRD generation
- **WHEN** the ralph-run.sh script is run on a change with all required artifacts
- **THEN** the system generates a PRD.md file containing structured sections from proposal, specs, and design
- **AND** the PRD.md follows a format compatible with open-ralph-wiggum's parsing expectations
- **AND** the generated PRD.md includes the Why, What Changes, Capabilities sections from proposal.md
- **AND** the generated PRD.md includes all requirement details from specs/*/spec.md files
- **AND** the generated PRD.md includes the Context, Goals, Decisions sections from design.md

### Requirement: Store generated PRD in internal directory
The system SHALL store the generated PRD.md file in the .ralph/ subdirectory within the change directory.

#### Scenario: PRD stored in internal directory
- **WHEN** PRD generation completes
- **THEN** the PRD.md file is written to `openspec/changes/<change-name>/.ralph/PRD.md`
- **AND** the .ralph/ directory is created if it does not exist
- **AND** the user is not required to interact with or modify the PRD.md file

### Requirement: Regenerate PRD on each script execution
The system SHALL regenerate the PRD.md file each time the ralph-run.sh script is run to ensure it reflects the latest OpenSpec artifacts.

#### Scenario: PRD regeneration
- **WHEN** the ralph-run.sh script is run multiple times
- **THEN** the PRD.md is regenerated from the current state of proposal.md, specs/*/*.md, and design.md
- **AND** any changes made to OpenSpec artifacts between runs are reflected in the regenerated PRD.md
- **AND** the previous PRD.md is overwritten

### Requirement: Maintain section structure in PRD conversion
The system SHALL preserve the hierarchical structure and headers from OpenSpec artifacts when converting to PRD format.

#### Scenario: Section structure preserved
- **WHEN** converting OpenSpec artifacts to PRD format
- **THEN** top-level headers (##) from proposal, design, and spec files become top-level headers in PRD.md
- **AND** requirement sections (###) become subsection headers in PRD.md
- **AND** scenario sections (####) are included with their WHEN/THEN format preserved
- **AND** the logical flow and organization of content is maintained
