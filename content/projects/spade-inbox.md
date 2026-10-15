---
slug: spade-inbox
name: Spade Inbox
org: Spade Security Services
status: internal
kind: Internal tool
category: Message-center automation
role: 'Developer, as part of the Spade freelance engagement'
summary: >-
  Message center automation with n8n email threading. Express and TypeScript on
  PostgreSQL.
context: >-
  A message center for Spade Security Services that automates how incoming email
  is threaded and handled.
approach: >-
  Express and TypeScript service on PostgreSQL, with n8n workflows handling
  email threading.
result: Delivered as an internal tool for the client. Screens are not shown publicly.
challenge: >-
  Threading rules live in n8n so they can change without a deploy, which means
  the application and the workflow have to agree on one message schema and never
  both write the same record.
stack:
  - Express
  - TypeScript
  - PostgreSQL
  - n8n
facts:
  - Message center automation
  - n8n email threading
  - Express / TypeScript / PostgreSQL
img: /assets/img/projects/spade-inbox.svg
featured: true
---

