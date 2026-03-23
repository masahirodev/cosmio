# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `defineModel()` — type-safe model definition with Zod schema, partition key, discriminator
- `CosmioClient` — singleton Cosmos DB client wrapper
- `CosmioContainer` — type-safe CRUD operations (create, upsert, findById, replace, delete, patch, query, bulk)
- `QueryBuilder` — fluent query builder with discriminator auto-filtering
- `MigrationRegistry` — global versioned migration system for read-time document transformation
- Model-level `migrate` and `validateOnRead` support
- `defaults` — auto-fill fields on create/upsert with static values or factory functions
- Container configuration: TTL, unique key policy, conflict resolution policy, indexing policy
- Schema generation: JSON Schema, OpenAPI 3.1, Markdown, Mermaid ER diagrams
- `analyzeModels()` — rule-based advisor with Azure Advisor categories (Cost/Performance/Reliability/Security/Operational Excellence)
- `generateAdvisorPrompt()` — AI-powered optimization with Cosmos DB Design Patterns reference
- CLI: `cosmio docs` command for document generation
- Docker Compose setup for Cosmos DB emulator
- Biome linter/formatter integration
- Dual package: ESM + CJS
