---
name: local-environment-verification
description: Verify if required local servers (frontend, backend) are running and start them if necessary before providing localhost links.
---

# Local Environment Verification

## Use this skill when
- The user requests to see or test a local web application.
- You need to provide a localhost URL to the user.
- A local backend or frontend server needs to be running for a task.

## Do not use
- For deploying to production or remote servers.
- If the project does not involve local development servers.

## Instructions
Always check if the required local servers (frontend, backend) are running (e.g. using `manage_task` or checking ports) before providing localhost links to the user.

If they are not running, start them in the background first.
