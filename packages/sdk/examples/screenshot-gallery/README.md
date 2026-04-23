# Screenshot Gallery Example

This script demonstrates how to iterate over screens in a Stitch project, retrieve their screenshot URLs, and generate a simple static HTML gallery.

This is a Tier 1 (Script) example, meaning it is deterministic and does not require agent intelligence.

## Prerequisites

1. Set your `STITCH_API_KEY` environment variable.
2. Ensure you have at least one project with generated screens in your Stitch account.

## Running the Example

```bash
cd packages/sdk/examples/screenshot-gallery
bun index.ts
```

This will fetch the first project it finds, iterate through its screens, collect the `getImage()` URLs, and write a `gallery.html` file to the current directory.

Open `gallery.html` in your web browser to view the generated gallery.
