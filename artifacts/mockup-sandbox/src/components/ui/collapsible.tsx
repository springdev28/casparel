/**
 * @fileOverview Repository role: implements or configures Collapsible.
 * System connection: see docs/codebase-guide.md and docs/source-file-index.md for its package boundary and consumers.
 */
"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
