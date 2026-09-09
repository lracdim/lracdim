---
title: "Spade Inbox: threading email with n8n"
description: "A message center built on Express, TypeScript, and PostgreSQL, with n8n handling how incoming email is threaded."
topic: Internal tools
date: 2026-09-09
order: 8
project: spade-inbox
---

Spade Inbox is an internal message center for Spade Security Services. It exists so that incoming email is handled as threads with structure behind them, rather than as loose messages in a shared mailbox.

## The shape of it

- **Express and TypeScript** run the service.
- **PostgreSQL** holds the messages, threads, and their state.
- **n8n** does the email threading: it receives mail, works out which conversation it belongs to, and writes it into the right thread.

Keeping the threading logic in n8n rather than in the application means the rules can be adjusted as a workflow, without a code deploy, while the application stays responsible for storage and the interface.

## What is public

The tool is internal to the client, so its screens are not shown here. The [project page](/work/spade-inbox/) lists the stack and what was delivered.
