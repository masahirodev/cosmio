# Contributing to Cosmio

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/masahirodev/cosmio.git
cd cosmio
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build ESM + CJS with tsup |
| `npm test` | Run unit tests |
| `npm run test:types` | Run type-level tests |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run typecheck` | TypeScript type check |
| `npm run check` | Biome lint + format check |
| `npm run check:fix` | Auto-fix lint + format issues |

### Integration Tests

```bash
npm run emulator:up      # Start Cosmos DB emulator
npm run test:integration # Run integration tests
npm run emulator:down    # Stop emulator
```

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass:
   ```bash
   npm run check       # Biome lint/format
   npm run typecheck   # TypeScript
   npm test            # Unit tests
   ```
4. Update documentation if needed (README.md, CHANGELOG.md)
5. Submit a pull request with a clear description

## Coding Standards

- **Formatter/Linter**: Biome (run `npm run check:fix` before committing)
- **Type safety**: Strict TypeScript — no `any` in public APIs
- **Tests**: All new features must include unit tests
- **Commits**: Use clear, descriptive commit messages

## Reporting Issues

- Use GitHub Issues
- Include a minimal reproduction if reporting a bug
- Label feature requests with `enhancement`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
