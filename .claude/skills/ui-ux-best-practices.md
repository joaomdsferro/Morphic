---
name: ui-ux-best-practices
description: The UI UX best practices for the Morphic app
---

# UI/UX Best Practices

When working on any UI in this project, apply the following rules to all components you create or modify.

## Buttons

- Every `<button>` element **must** include the Tailwind class `hover:cursor-pointer`.
  - This ensures a pointer cursor on hover, which is expected browser behaviour for interactive elements.
  - I.e.: `className="hover:cursor-pointer"`
  - This applies to all buttons: icon buttons, action buttons, toggle buttons, form submit buttons.

> When reviewing or modifying existing components, add `hover:cursor-pointer` to any button that is missing it.
