/**
 * The toolbar and the repository view share one header row. The toolbar
 * renders these two empty slots; the repository view portals its
 * Review/Files switch and its actions into them.
 */

/** Before the repository controls: the Review/Files switch. */
export const ToolbarLeadingSlotId = 'toolbar-review-modes'

/** After the flexible spacer: compare, refresh and settings. */
export const ToolbarTrailingSlotId = 'toolbar-review-actions'
