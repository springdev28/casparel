#!/bin/bash
# @fileOverview: Repository tooling role: implements Post Merge for workspace development, build, validation, or documentation.
# System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
