---
"@hussmartinez/learn-sdk": minor
---

`LearnPlayer` takes `headingLevel`, from `2` to `6`, so its exercise titles fit your page's outline (sdk-core ADR 0058). It defaults to `2`, which renders the `<h2>` it always has. A value outside 2 to 6 is treated as `2`, with a warning in development. A block you pass in `blocks` that renders `Heading` from `@hussmartinez/ui/react` gets the level below the title. The `HeadingLevel` type is exported from `@hussmartinez/learn-sdk/react`.

```tsx
<LearnPlayer content={content} headingLevel={3} />
```

learn-sdk now depends on `@hussmartinez/ui` ^0.16.0. If your app also depends on ui, directly or through another `@hussmartinez` SDK, move it to ^0.16.0 too, so the app keeps a single copy.
