# How to Contribute

We would love to accept your patches and contributions to this project.

## Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License
Agreement (CLA). You (or your employer) retain the copyright to your
contribution; this simply gives us permission to use and redistribute your
contributions as part of the project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

## Code Reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

## Community Guidelines

This project follows
[Google's Open Source Community Guidelines](https://opensource.google/conduct/).

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.3+
- Node.js 18+

### Setup

```bash
bun install
```

### Testing

```bash
# Unit tests
npm run test

# Script tests (IR schema, codegen)
npm run test:scripts

# Smoke test (packaging verification)
npm run test:smoke

# Lock validation
npm run validate:generated
```

### Code Style

```bash
npm run format:check    # check formatting
npx prettier --write .  # fix formatting
```

### Pull Request Process

1. Fork the repo and create a feature branch
2. Ensure all tests pass: `npm run test && npm run test:scripts && npm run test:smoke`
3. Run the formatter: `npx prettier --write .`
4. Submit a pull request with a clear description of the change
