---
title: "Spade Academy: a learning platform on two hosts"
description: "A React and TypeScript learning management system with an Express and PostgreSQL back end, split across Hostinger and Railway."
topic: Applications
date: 2026-09-09
project: spade-academy
---

Spade Academy LMS is a learning management system built for Spade Security Services training content. Three features define it: video progress tracking, quizzes, and certificate generation.

## Front end and back end on different hosts

The React and TypeScript front end is hosted on Hostinger. The Express and PostgreSQL back end runs on Railway. Splitting them keeps the static front end cheap to serve while the API and database live where they can be scaled and inspected independently.

## The three features

- **Video progress tracking** records how far a learner has watched, so a course resumes where it was left.
- **Quizzes** check understanding at the points a course defines.
- **Certificate generation** produces a certificate once a course is complete.

Learner numbers are not published here. The [project page](/work/spade-academy/) lists the stack and delivered features.
