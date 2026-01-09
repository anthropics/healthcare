# Error Handling

## MCP Server Unavailable
- Detected in: Step 1
- Action: Display error with installation instructions
- Allow user to retry after installing MCP server
- No fallback available - MCP server is required for protocol research

## Step Fails or Returns Error
- Action: Display error message from workflow step
- Ask user: "Retry step? (Yes/No)"
  - Yes: Re-run step
  - No: Save current state, exit orchestrator

## User Interruption
- All progress saved in waypoint files
- User can resume anytime by restarting the skill
- Workflow automatically detects completed steps and resumes from next step
- No data loss
