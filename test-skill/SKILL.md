---
title: Test Skill
description: A minimal test skill for validating the skill review workflow. Use this skill when testing skill review automation.
---

# Test Skill

This is a minimal skill created to test the skill review workflow.

## Overview

This skill does nothing useful - it exists purely to test that the Claude Skill Review GitHub Action correctly identifies and reviews new skills.

## Usage

```
/test-skill
```

## What it does

1. Prints "Hello from test skill"
2. Exits

## Expected Review Behavior

When this skill is added in a PR, the skill review workflow should:
- Detect this as a NEW skill (not an update)
- Provide a full review of the entire skill
- Use the title "Test Skill" in the comment header
