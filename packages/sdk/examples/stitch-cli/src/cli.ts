import { stitch } from "@google/stitch-sdk";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Stitch CLI (Agent CLI)

Usage:
  bun src/cli.ts <command> [options]

Commands:
  schema <cmd>      Output the JSON schema for a command. (cmd: generate, export, extract-theme)
  generate --json   Generate a screen. Expects JSON string.
  export --json     Export a screen URL. Expects JSON string.
  extract-theme --json Extract theme from a screen. Expects JSON string.

Examples:
  bun src/cli.ts schema generate
  bun src/cli.ts generate --json '{"projectId": "...", "prompt": "..."}'
  bun src/cli.ts export --json '{"projectId": "...", "screenId": "...", "format": "html"}'
  bun src/cli.ts extract-theme --json '{"projectId": "...", "screenId": "..."}'
`);
    return;
  }

  const command = args[0];

  try {
    if (command === "schema") {
      const subCommand = args[1];
      if (subCommand === "generate") {
        console.log(
          JSON.stringify(
            {
              type: "object",
              properties: {
                projectId: { type: "string" },
                prompt: { type: "string" },
                deviceType: {
                  type: "string",
                  enum: ["MOBILE", "DESKTOP", "TABLET", "AGNOSTIC"],
                },
              },
              required: ["projectId", "prompt"],
            },
            null,
            2,
          ),
        );
      } else if (subCommand === "extract-theme") {
        console.log(
          JSON.stringify(
            {
              type: "object",
              properties: {
                projectId: { type: "string" },
                screenId: { type: "string" },
              },
              required: ["projectId", "screenId"],
            },
            null,
            2,
          ),
        );
      } else if (subCommand === "export") {
        console.log(
          JSON.stringify(
            {
              type: "object",
              properties: {
                projectId: { type: "string" },
                screenId: { type: "string" },
                format: { type: "string", enum: ["html", "image"] },
              },
              required: ["projectId", "screenId", "format"],
            },
            null,
            2,
          ),
        );
      } else {
        console.error("Unknown schema command. Try 'generate', 'export', or 'extract-theme'.");
        process.exit(1);
      }
      return;
    }

    if (command === "generate") {
      const jsonIndex = args.indexOf("--json");
      if (jsonIndex === -1 || jsonIndex + 1 >= args.length) {
        console.error("Missing --json argument.");
        process.exit(1);
      }
      const payload = JSON.parse(args[jsonIndex + 1]);
      if (!payload.projectId || !payload.prompt) {
        console.error(
          JSON.stringify({ error: "Missing projectId or prompt in JSON." }),
        );
        process.exit(1);
      }

      const project = stitch.project(payload.projectId);
      const screen = await project.generate(payload.prompt, payload.deviceType);

      console.log(
        JSON.stringify(
          {
            screenId: screen.id,
            projectId: screen.projectId,
            success: true,
          },
          null,
          2,
        ),
      );
      return;
    }


    if (command === "extract-theme") {
      const jsonIndex = args.indexOf("--json");
      if (jsonIndex === -1 || jsonIndex + 1 >= args.length) {
        console.error("Missing --json argument.");
        process.exit(1);
      }
      const payload = JSON.parse(args[jsonIndex + 1]);
      if (!payload.projectId || !payload.screenId) {
        console.error(
          JSON.stringify({ error: "Missing projectId or screenId in JSON." }),
        );
        process.exit(1);
      }

      try {
        const project = stitch.project(payload.projectId);
        const screen = await project.getScreen(payload.screenId);
        const htmlUrl = await screen.getHtml();

        const resp = await fetch(htmlUrl);
        const html = await resp.text();
        const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);

        let theme = null;
        if (configMatch && configMatch[1]) {
           theme = configMatch[1].trim();
        }

        console.log(
          JSON.stringify(
            {
              theme,
              success: true,
            },
            null,
            2,
          ),
        );
      } catch (error: any) {
         console.error(
          JSON.stringify({ error: "Failed to extract theme: " + error.message, success: false })
        );
        process.exit(1);
      }
      return;
    }

    if (command === "export") {
      const jsonIndex = args.indexOf("--json");
      if (jsonIndex === -1 || jsonIndex + 1 >= args.length) {
        console.error("Missing --json argument.");
        process.exit(1);
      }
      const payload = JSON.parse(args[jsonIndex + 1]);
      if (!payload.projectId || !payload.screenId || !payload.format) {
        console.error(
          JSON.stringify({
            error: "Missing projectId, screenId, or format in JSON.",
          }),
        );
        process.exit(1);
      }

      const project = stitch.project(payload.projectId);
      let screen;
      try {
        screen = await project.getScreen(payload.screenId);
      } catch (e) {
         console.error(JSON.stringify({ error: "Screen ID not found or invalid." }));
         process.exit(1);
      }

      let url: string | undefined;
      if (payload.format === "html") {
        url = await screen.getHtml();
      } else if (payload.format === "image") {
        url = await screen.getImage();
      } else {
        console.error(
          JSON.stringify({ error: "Invalid format. Use 'html' or 'image'." }),
        );
        process.exit(1);
      }

      console.log(
        JSON.stringify(
          {
            url,
            success: true,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.error(`Unknown command: ${command}`);
    process.exit(1);
  } catch (error: any) {
    console.error(
      JSON.stringify({
        error: error.message || "An unknown error occurred",
        success: false,
      }),
    );
    process.exit(1);
  }
}

main();
