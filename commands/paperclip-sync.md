---
description: Sync with Paperclip agents — current state plus what changed since last sync
argument-hint: "[cursor from previous sync]"
---
Call `paperclip_sync_snapshot`. If a cursor was given ($ARGUMENTS), also call `paperclip_sync_changes` with it. Summarise what each agent is doing, what changed, and end with the new cursor so the next sync can continue from it.
