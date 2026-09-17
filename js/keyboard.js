"use strict";

/* ----------------------------------------------------------------------------
   Keyboard input layer

   Translates key presses into the same handlers the on-screen keypad uses,
   and flashes the matching key for visual feedback. Loaded after
   calculator.js, so the handlers below are already defined.
   ---------------------------------------------------------------------------- */

const KEYBOARD_MAP = new Map();

for (let digit = 0; digit <= 9; digit += 1) {
  const value = String(digit);
  KEYBOARD_MAP.set(value, {
    selector: `[data-digit="${value}"]`,
    run: () => inputDigit(value),
  });
}

/* Operators — accept both '*' and 'x' for multiplication. */
[
  ["+", "+"],
  ["-", "-"],
  ["*", "*"],
  ["x", "*"],
  ["X", "*"],
  ["/", "/"],
].forEach(([key, operator]) => {
  KEYBOARD_MAP.set(key, {
    selector: `[data-operator="${operator}"]`,
    run: () => chooseOperator(operator),
  });
});

KEYBOARD_MAP.set("=", { selector: '[data-action="equals"]', run: evaluate });
KEYBOARD_MAP.set("Enter", {
  selector: '[data-action="equals"]',
  run: evaluate,
});
KEYBOARD_MAP.set(".", {
  selector: '[data-action="decimal"]',
  run: inputDecimal,
});
KEYBOARD_MAP.set(",", {
  selector: '[data-action="decimal"]',
  run: inputDecimal,
});
KEYBOARD_MAP.set("Backspace", {
  selector: '[data-action="backspace"]',
  run: backspace,
});
KEYBOARD_MAP.set("Escape", {
  selector: '[data-action="clear"]',
  run: clearAll,
});
KEYBOARD_MAP.set("Delete", {
  selector: '[data-action="clear"]',
  run: clearAll,
});

function handleKeydown(event) {
  /* Never hijack browser or OS shortcuts. */
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // Let a focused on-screen key keep its native Enter/Space activation.
  if (event.target.closest(".key")) return;

  const entry = KEYBOARD_MAP.get(event.key);
  if (!entry) return;

  event.preventDefault();
  entry.run();
  flashKey(entry.selector);
}

document.addEventListener("keydown", handleKeydown);
