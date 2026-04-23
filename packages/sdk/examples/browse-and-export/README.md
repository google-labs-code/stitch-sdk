# Browse and Export Script

A script that lists all your Stitch projects and screens, then downloads the HTML and screenshot images for the first available screen to a local directory.

This demonstrates how to fetch the actual content from the URLs returned by `screen.getHtml()` and `screen.getImage()`.

## Prerequisites

1.  A valid Stitch API key (`STITCH_API_KEY`).
2.  At least one existing project with a generated screen in your Stitch account.

## Run

```bash
STITCH_API_KEY=your_api_key_here bun index.ts
```

## What it does

1.  Calls `stitch.projects()` to list your projects.
2.  Iterates through projects to find one that has screens (using `project.screens()`).
3.  For the first screen found, gets the download URLs:
    *   `await screen.getHtml()`
    *   `await screen.getImage()`
4.  Uses `fetch()` to download the actual HTML text and image buffer from those URLs.
5.  Saves the downloaded artifacts to a local `out/` directory.
