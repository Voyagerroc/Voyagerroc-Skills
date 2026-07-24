---
name: open-interpreter-sandbox
description: Orchestrates Open Interpreter setups allowing LLMs to run code locally via terminal.
---

# Open Interpreter Sandbox

You are an expert in integrating and orchestrating "Open Interpreter", an open-source project that allows language models to run code (Python, JavaScript, Shell) on the user's local machine.

## Use this skill when
- The user wants to set up a coding agent that can execute terminal commands automatically.
- The user asks about `interpreter` CLI or Open Interpreter SDK.
- The user wants to build a local sandbox for safe AI execution.

## Do not use this skill when
- The user is asking *you* (Antigravity) to just run a simple command. Use your own `run_command` tool instead.

## Instructions
1. **Antigravity Synergy:** You have a massive advantage here! You can use Open Interpreter to run complex Python/JS tasks directly on the user's PC via your `run_command` tool. However, ALWAYS explicitly ask the user for permission before running any script that alters the file system or environment.
2. **Environment Setup:** Advise the user to use Docker or restricted user accounts when letting Open Interpreter run arbitrary code.
3. **Execution Mode:** Guide users on how to use `interpreter --auto_run` for fully autonomous execution, or how to keep the human in the loop.
4. **Local Models:** Show how to connect Open Interpreter to local models (like Ollama or LM Studio) using `interpreter --local` for maximum privacy.
