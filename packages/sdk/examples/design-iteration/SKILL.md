# Skill: Design Iteration Workflow

This skill teaches you how to use the Stitch SDK (`@google/stitch-sdk`) to iteratively edit and improve a design based on feedback.

## Usage

1. **Evaluate**: Generate or retrieve a screen, and use `screen.getImage()` to obtain the screenshot URL. Analyze the screenshot to identify issues or improvements.
2. **Edit**: Use `screen.edit("instruction")` to refine the design.
3. **Variants**: If exploring options, use `screen.variants("instruction", { variantCount: 3, aspects: ["COLOR_SCHEME"] })`.
4. **Loop**: Repeat until the design meets requirements.

## Example

```typescript
import { stitch } from "@google/stitch-sdk";

const project = await stitch.createProject("App");
let screen = await project.generate("A landing page");

// ...evaluate screen.getImage()...

// Edit based on evaluation
screen = await screen.edit("Make the header darker");

// Or explore variants
const variants = await screen.variants("Try different color schemes", { variantCount: 3 });
```
