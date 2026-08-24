# Design quality

The Cycle workflow treats visual and interaction design quality as a
review gate for changes that touch the user-visible surface. The
principle is the same as compactness: the user did not ask for
generic AI aesthetics, and the workflow should not deliver them.

This document is the principle. The enforcement is in the role
prompts and the functional reviewer's checklist.

## What the executor avoids

The executor avoids the markers of a generic AI-generated UI. The
markers are:

- Side-tab borders where the design system uses a different
  separator.
- Purple-to-blue gradients on buttons, cards, or backgrounds.
- `cubic-bezier` bounce easings for transitions.
- Dark-mode glows and inner shadows on focus rings.
- Identical card padding across surfaces that the design system
  treats as different.
- Repeated iconography that the project's icon set does not use.
- Centered hero sections in a layout the project uses left-aligned.
- Modal-on-modal stacks.
- Skip-level heading hierarchy (h1, h3, h4 with no h2).
- Hover-only affordances on touch-primary surfaces.

The executor reads the project's design tokens before writing
visual code. If the project does not have design tokens, the
executor writes the change in a way that does not introduce the
markers above and flags the missing tokens in the `task_summary`.

## What the reviewer checks

The functional reviewer, for a change that touches the
user-visible surface, produces a `design_quality` finding list in
addition to the regular findings. The list covers:

1. **Color and contrast.** The change uses the project's palette. No
   hard-coded colors that are not in the palette. The contrast ratio
   is at least 4.5:1 for body text and 3:1 for large text, in both
   light and dark mode.
2. **Typography.** The change uses the project's type scale. The
   line length is between 50 and 80 characters. The line height is
   between 1.4 and 1.7 for body text.
3. **Spacing.** The change uses the project's spacing scale. No
   arbitrary pixel values. The padding is consistent across the
   same surface type.
4. **Motion.** The change uses the project's motion tokens. No
   easings that are not in the token set. No animations longer than
   400ms.
5. **Affordance.** Interactive elements are recognizable as
   interactive. The cursor, the focus ring, and the touch target
   size (≥ 44×44 CSS pixels) are correct.
6. **Hierarchy.** The heading levels are sequential. The visual
   weight follows the heading level.
7. **Localization.** The change does not hard-code strings. The
   strings are in the project's translation catalog. The layout
   accommodates 30% text expansion.
8. **Accessibility.** The change passes the project's automated
   accessibility checks. The change is operable by keyboard alone.
   The change is announced by a screen reader.

A failure on color, contrast, typography, or motion is a `major`
finding. A failure on affordance, hierarchy, or accessibility is a
`blocker` finding. A failure on localization is a `major` finding
for changes to user-visible text.

## Optional: design baseline

The project may declare a design baseline in
`.cycle/baselines/visual/`. The baseline is a directory of approved
screenshots the functional reviewer can compare against. The
reviewer diffs the candidate screenshot against the baseline and
reports any new visual regression.

The baseline is not required. A project without a baseline still
gets the eight checks above. A project with a baseline also gets
the diff.

## Optional: user study

The functional reviewer may, for changes that introduce a new
interaction pattern, request a manual user study. The user study is
a `manual` evidence gate. The executor prompts the user, the user
runs the study with two or more participants, and the user records
the outcome. The workflow proceeds only when the user records a
satisfactory outcome.

A user study is opt-in. The project opts in by setting
`quality.user_study: true` in `.cycle/cycle.config.json`. The
default is `false`.
