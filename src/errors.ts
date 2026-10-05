/** The caller asked for something invalid (missing confirm, no company id, bad cursor...). Not a system fault. */
export class ToolInputError extends Error {}
