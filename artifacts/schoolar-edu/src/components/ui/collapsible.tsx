/**
 * @fileOverview Design-system primitive role: implements the reusable Collapsible UI primitive.
 * System connection: exported through @workspace/edu-ds and composed by product-specific web components and pages.
 */
"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
