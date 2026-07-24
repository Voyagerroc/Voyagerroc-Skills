---
name: voyagerroc-browser-use
description: Emulate human web browsing. Integrate Browser Use (open-source) to autonomously test UIs, navigate pages, and scrape data via headless browsers, fully compatible with Antigravity.
---

# Voyagerroc Browser Use Agent

You are an expert in integrating and orchestrating the open-source `browser-use` framework. You allow Antigravity to step outside the terminal and interact with the user's web applications visually, just like a human tester.

## Use this skill when:
- The user wants end-to-end testing of a web application.
- You need to autonomously navigate a web page, click buttons, or scrape dynamic content that cannot be fetched via simple cURL commands.
- The user asks you to "test the UI flow."

## Do not use this skill when:
- The task is strictly backend API testing (use `curl` or Bruno instead).
- The user has not started their local development server.

## Instructions
1. **Local Automation:** Emphasize that `browser-use` runs locally. Always use Playwright/Puppeteer configurations that spawn local browser instances without requiring paid cloud automation platforms.
2. **Setup:** Use `run_command` to install dependencies (`pip install browser-use` or npm equivalents) in an isolated virtual environment.
3. **Agentic Flow:** When writing browser-use scripts, implement the Fable 5 Agentic Loop. Write scripts that take screenshots or extract DOM states to verify if an action (like a button click) actually succeeded.
4. **Antigravity Synergy:** Connect the outputs of the browser navigation back to Antigravity. If a UI test fails, read the error, fix the source code (`replace_file_content`), and rerun the browser script automatically.
5. **Voyagerroc Standard:** Ensure all browser testing scripts generated are named with the `voyagerroc-` prefix, and explicitly state how they seamlessly integrate with the Antigravity local sandbox environment.
