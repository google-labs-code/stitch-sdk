# Agent Skill: HTML Email from Design

This skill teaches an agent how to use the Stitch SDK to generate HTML emails.

## Context
When generating an email using Stitch, the agent must optimize the prompt for email constraints:
- Use single-column layouts where possible
- Avoid complex CSS features
- Keep the design simple and readable

## Process
1.  **Craft Prompt:** Adjust the design prompt for email constraints (e.g., single column, inline styles, basic colors).
2.  **Generate Design:** Use the Stitch CLI or SDK to generate the email template.
3.  **Process HTML:** Use the email CLI tool (`stitch email --json ...`) to inline CSS and format the output for email clients.
