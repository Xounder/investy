# Architecture.md

# BrkRoutnXdle Architecture

## Overview

BrkRoutnXdle is an orchestration layer built on top of Google Calendar.

The system's goal is to allow users to define recurring tasks and constraints, automatically generating a distributed and partially randomized weekly schedule.

The system has no database of its own.

Google Calendar acts as the source of truth for events.

The frontend only maintains local configurations and task definitions via localStorage.

---

# Core Principles

## Google Calendar First

Every generated event must exist in Google Calendar.

The system must never maintain a parallel copy of events.

Events are always read from Google Calendar.

Events are always persisted to Google Calendar.

---

## Stateless Backend

The backend has no database.

The backend does not store users.

The backend does not maintain persistent sessions.

The backend exists only for:

* Google OAuth
* Refresh Tokens
* Communication with Google APIs
* Response normalization

---

## Calendar As Source Of Truth

Google Calendar is responsible for storing:

* Generated events
* Dates
* Times
* Completion status
* Event metadata

---

## Local Configuration

The browser is responsible for storing:

* Tasks
* Settings
* Blocks
* Preferences

Cross-device synchronization is not a V1 goal.

---

# High Level Architecture

```text
┌─────────────────────┐
│ React Frontend      │
└──────────┬──────────┘
           │
           │ HTTPS
           │
┌──────────▼──────────┐
│ Express BFF         │
└──────────┬──────────┘
           │
           │
           ▼
┌─────────────────────┐
│ Google Calendar API │
└─────────────────────┘
```

---

# Technology Stack

## Frontend

* React
* TypeScript
* Vite
* React Query
* React Hook Form
* Context API
* Zod
* FullCalendar

---

## Backend

* Node.js
* Express
* TypeScript
* googleapis
* Zod

---

# Calendar Strategy

## Dedicated Calendar

A dedicated calendar will be created during first login.

Name:

```text
BrkRoutnXdle
```

---

## Calendar Responsibilities

### Primary Calendar

Read-only.

Used for:

* Discovering existing events
* Discovering busy time slots

---

### BrkRoutnXdle Calendar

Read and write.

Used for:

* Generated tasks
* Completed tasks
* System updates

---

# Event Metadata

Every generated event must include:

```json
{
  "extendedProperties": {
    "private": {
      "app": "BrkRoutnXdle",
      "generated": "true",
      "completed": "false",
      "taskId": "task-id",
      "created": "timestamp",
      "updated": "timestamp"
    }
  }
}
```

---

# Local Storage

## Structure

```json
{
  "tasks": [],
  "blockedSlots": [],
  "settings": {}
}
```

---

## Cache Structure

```json
{
  "calendarCache": {
    "data": {},
    "expiresAt": 0
  }
}
```

---

## Cache Duration

```text
5 minutes
```

After expiration:

```text
Refetch Google Calendar
```

---

# Time Model

## Slot Duration

The system works in slots of:

```text
30 minutes
```

---

## Allowed Task Durations

Allowed:

```text
30
60
90
120
150
180
...
```

Not allowed:

```text
15
45
75
95
```

---

# Security

## Authentication

Google OAuth.

---

## Authorization

Only authenticated user.

---

## Secrets

Never exposed to the frontend.

---

# ADRs

## ADR-001

Google Calendar is source of truth.

---

## ADR-002

No database.

---

## ADR-003

Settings in localStorage.

---

## ADR-004

Dedicated BrkRoutnXdle calendar.

---

## ADR-005

30-minute slots.

---

## ADR-006

Stateless backend.

---

## ADR-007

Preview required before saving.

---

## ADR-008

Recalculate only future events.

---

## ADR-009

Google Calendar always wins conflicts.

---

# Future Improvements

## Optional

* Google Drive Sync
* Shared Schedules
* Multi Device Sync
* Mobile App
* Notifications
* AI Assisted Scheduling
* Smart Recommendations
* Historical Analytics
* Habit Tracking
* Gamification

---

# Non Goals

Not part of V1.

* Database
* Multiplayer
* Sharing
* Marketplace
* Chat
* Social Features
* Machine Learning
* Real Time Collaboration
* Cross Device Synchronization

---

# Success Criteria

The system will be considered functional when it can:

1. Authenticate with Google.
2. Create dedicated calendar.
3. Read user availability.
4. Generate weekly schedule.
5. Display preview.
6. Persist events.
7. Partially recalculate week.
8. Respect blocks.
9. Respect previous week.
10. Sync changes with Google Calendar.
11. Allow full management through a single screen.

---

# Related Documents

Detailed topics are documented in dedicated files:

| Topic | Document |
|-------|----------|
| Domain Model | [domain-model.md](domain-model.md) |
| Canonical Data Model | [canonical-data-model.md](canonical-data-model.md) |
| Week Generation Algorithm | [generation-algorithm.md](generation-algorithm.md) |
| Error Handling | [docs/error-handling-strategy.md](docs/error-handling-strategy.md) |
| User Interface / UX Flows | [ux-flows.md](ux-flows.md) |
| Google Calendar Integration | [google-calendar-integration.md](google-calendar-integration.md) |
| Event Classification | [event-classification.md](event-classification.md) |
