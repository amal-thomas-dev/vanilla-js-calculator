'use strict';

/* ----------------------------------------------------------------------------
   Calculator core

   Math, formatting, state, rendering and click handling. Keyboard input is
   wired up separately in keyboard.js — both files share the page's global
   scope, so keyboard.js can call these functions directly by name.
   ---------------------------------------------------------------------------- */

const MAX_INPUT_DIGITS = 12;
const MAX_DISPLAY_CHARS = 14;
const EXPONENTIAL_PRECISION = 6;
const KEY_FLASH_DURATION = 130;
const ANIMATION_DURATION = 600;

const ERROR_DIVIDE_BY_ZERO = 'Divide by 0? Nope.';
const ERROR_OUT_OF_RANGE = 'Out of range';
const ERROR_UNDEFINED = 'Undefined result';

const OPERATOR_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/* Frozen so the template can never be mutated by accident. */
const INITIAL_STATE = Object.freeze({
  displayValue: '0',
  firstOperand: null,
  operator: null,
  awaitingOperand: true,
  expression: '',
  hasError: false,
});

/* ----------------------------------------------------------------------------
   Pure math functions
   ---------------------------------------------------------------------------- */

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  return b === 0 ? null : a / b;
}

/* Single entry point for arithmetic. Returns null on divide-by-zero so
   callers can tell a real result apart from an error signal. */
function operate(operator, a, b) {
  switch (operator) {
    case '+':
      return add(a, b);
    case '-':
      return subtract(a, b);
    case '*':
      return multiply(a, b);
    case '/':
      return divide(a, b);
    default:
      return null;
  }
}

/* ----------------------------------------------------------------------------
   Formatting helpers
   ---------------------------------------------------------------------------- */

/* Trims float noise (0.30000000000000004) and falls back to exponential
   notation when the result would overflow the display. */
function formatNumber(value) {
  const rounded = parseFloat(value.toPrecision(MAX_INPUT_DIGITS));
  const text = String(rounded);
  if (text.length <= MAX_DISPLAY_CHARS) return text;

  /* toExponential can leave cosmetic trailing zeros and a "+" in the
     exponent — strip both for a cleaner readout. */
  return rounded
    .toExponential(EXPONENTIAL_PRECISION)
    .replace(/\.?0+e/, 'e')
    .replace('e+', 'e');
}

/* Counts digits only — the sign and decimal point don't count toward
   the user's input limit. */
function countDigits(value) {
  return value.replace(/[-.]/g, '').length;
}

/* ----------------------------------------------------------------------------
   State
   ---------------------------------------------------------------------------- */

let state = { ...INITIAL_STATE };

function resetState() {
  state = { ...INITIAL_STATE };
}

/* ----------------------------------------------------------------------------
   DOM references
   ---------------------------------------------------------------------------- */

const displayWrapEl = document.getElementById('displayWrap');
const displayEl = document.getElementById('display');
const expressionEl = document.getElementById('expression');
const keypadEl = document.getElementById('keypad');
const decimalKeyEl = keypadEl.querySelector('[data-action="decimal"]');
const copyBtnEl = document.getElementById('copyBtn');

/* ----------------------------------------------------------------------------
   Rendering
   ---------------------------------------------------------------------------- */

/* Single place that writes to the DOM; everything else just mutates state. */
function render() {
  displayEl.textContent = state.displayValue;
  expressionEl.textContent = state.expression;

  decimalKeyEl.disabled =
    state.hasError ||
    (!state.awaitingOperand && state.displayValue.includes('.'));

  copyBtnEl.disabled = state.hasError;

  const length = state.displayValue.length;
  displayEl.classList.toggle(
    'display__value--medium',
    !state.hasError && length > 9 && length <= MAX_INPUT_DIGITS + 2,
  );
  displayEl.classList.toggle(
    'display__value--small',
    !state.hasError && length > MAX_INPUT_DIGITS + 2,
  );
  displayEl.classList.toggle('display__value--error', state.hasError);
  displayWrapEl.classList.toggle('display--error', state.hasError);
}

/* ----------------------------------------------------------------------------
   Error handling
   ---------------------------------------------------------------------------- */

function showError(message) {
  state.displayValue = message;
  state.firstOperand = null;
  state.operator = null;
  state.awaitingOperand = true;
  state.expression = '';
  state.hasError = true;

  render();

  /* One-shot animation classes, removed after they've played. */
  displayWrapEl.classList.add('display--pulse');
  displayEl.classList.add('display__value--shake');
  window.setTimeout(() => {
    displayWrapEl.classList.remove('display--pulse');
    displayEl.classList.remove('display__value--shake');
  }, ANIMATION_DURATION);
}

/* Routes a raw result to the right error, or returns it unchanged. */
function guardResult(result) {
  if (result === null) {
    showError(ERROR_DIVIDE_BY_ZERO);
    return null;
  }
  if (Number.isNaN(result)) {
    showError(ERROR_UNDEFINED);
    return null;
  }
  if (!Number.isFinite(result)) {
    showError(ERROR_OUT_OF_RANGE);
    return null;
  }
  return result;
}

/* ----------------------------------------------------------------------------
   Input handlers
   ---------------------------------------------------------------------------- */

function inputDigit(digit) {
  if (state.hasError) resetState();

  if (state.awaitingOperand) {
    state.displayValue = digit;
    state.awaitingOperand = false;
  } else if (countDigits(state.displayValue) < MAX_INPUT_DIGITS) {
    state.displayValue =
      state.displayValue === '0' ? digit : state.displayValue + digit;
  }

  render();
}

function inputDecimal() {
  if (state.hasError) resetState();

  if (state.awaitingOperand) {
    state.displayValue = '0.';
    state.awaitingOperand = false;
  } else if (!state.displayValue.includes('.')) {
    state.displayValue += '.';
  }

  render();
}

function chooseOperator(nextOperator) {
  if (state.hasError) return;

  const inputValue = parseFloat(state.displayValue);

  /* Two operators in a row — just swap the pending one. */
  if (state.operator !== null && state.awaitingOperand) {
    state.operator = nextOperator;
    state.expression = `${formatNumber(state.firstOperand)} ${OPERATOR_SYMBOLS[nextOperator]}`;
    render();
    return;
  }

  if (state.firstOperand === null) {
    state.firstOperand = inputValue;
  } else if (state.operator !== null) {
    /* Pairwise evaluation: resolve the pending op before starting a new
       one, so a chain like "12 + 7 - 5" resolves left-to-right. */
    const result = guardResult(
      operate(state.operator, state.firstOperand, inputValue),
    );
    if (result === null) return;

    state.firstOperand = result;
    state.displayValue = formatNumber(result);
  }

  state.operator = nextOperator;
  state.awaitingOperand = true;
  state.expression = `${formatNumber(state.firstOperand)} ${OPERATOR_SYMBOLS[nextOperator]}`;

  render();
}

function evaluate() {
  if (state.hasError) return;

  /* Nothing pending — flash the equals key so the press feels acknowledged. */
  if (state.operator === null || state.firstOperand === null) {
    flashKey('[data-action="equals"]');
    return;
  }

  const inputValue = parseFloat(state.displayValue);
  const result = guardResult(
    operate(state.operator, state.firstOperand, inputValue),
  );
  if (result === null) return;

  state.expression =
    `${formatNumber(state.firstOperand)} ` +
    `${OPERATOR_SYMBOLS[state.operator]} ` +
    `${formatNumber(inputValue)} =`;

  state.displayValue = formatNumber(result);
  state.firstOperand = null;
  state.operator = null;
  state.awaitingOperand = true;

  render();
}
function backspace() {
  if (state.hasError) {
    resetState();
    render();
    return;
  }

  if (state.awaitingOperand) {
    if (state.operator !== null) {
      state.displayValue = formatNumber(state.firstOperand);
      state.operator = null;
      state.firstOperand = null;
      state.awaitingOperand = false;
      state.expression = '';
      render();
    }
    return;
  }

  let next = state.displayValue.slice(0, -1);
  if (next === '' || next === '-') next = '0';
  state.displayValue = next;
  render();
}

function clearAll() {
  resetState();
  render();
}

/* ----------------------------------------------------------------------------
   Key flash (called from keyboard.js too)
   ---------------------------------------------------------------------------- */

const flashTimers = new WeakMap();

function flashKey(selector) {
  const key = keypadEl.querySelector(selector);
  if (!key || key.disabled) return;

  const pending = flashTimers.get(key);
  if (pending !== undefined) window.clearTimeout(pending);

  key.classList.add('key--active');
  flashTimers.set(
    key,
    window.setTimeout(() => {
      key.classList.remove('key--active');
      flashTimers.delete(key);
    }, KEY_FLASH_DURATION),
  );
}

/* ----------------------------------------------------------------------------
   Click handling
   ---------------------------------------------------------------------------- */

copyBtnEl.addEventListener('click', () => {
  if (state.hasError) return;
  navigator.clipboard?.writeText(state.displayValue).then(() => {
    copyBtnEl.classList.add('display__copy--done');
    window.setTimeout(
      () => copyBtnEl.classList.remove('display__copy--done'),
      900,
    );
  });
});

function handleKeypadClick(event) {
  /* closest() lets one listener serve every key, including clicks on
     nested elements such as the SVG inside the backspace button. */
  const key = event.target.closest('.key');
  if (!key || key.disabled) return;

  const { digit, operator, action } = key.dataset;

  if (digit !== undefined) return inputDigit(digit);
  if (operator !== undefined) return chooseOperator(operator);

  switch (action) {
    case 'decimal':
      return inputDecimal();
    case 'equals':
      return evaluate();
    case 'clear':
      return clearAll();
    case 'backspace':
      return backspace();
  }
}

keypadEl.addEventListener('click', handleKeypadClick);

/* ----------------------------------------------------------------------------
   Boot
   ---------------------------------------------------------------------------- */

render();
