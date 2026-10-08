import React, { useEffect, useRef, useState } from 'react';
import {
} from '@/utils/amount';

const evaluateCalculatorExpression = evaluateAmountExpression;
const formatCalculatorResult = (value: number): string => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
const displayCalculatorExpression = (value: string): string => value.replace(/\*/g, '×').replace(/\//g, '÷');

interface AmountKeypadProps {
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;
}

type Key =
  | 'clear'
  | 'backspace'
  | 'equals'
  | 'done'
  | '.'
  | '00'
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '+'
  | '-'
  | '*'
  | '/';

const OPERATOR_KEYS = new Set<Key>(['+', '-', '*', '/']);

const labelForKey = (key: Key): string => {
  switch (key) {
    case 'clear':
      return 'C';
    case 'backspace':
      return '⌫';
    case 'equals':
      return '=';
    case 'done':
      return 'Done';
    case '+':
      return '＋';
    case '-':
      return '−';
    case '*':
      return '×';
    case '/':
      return '÷';
    default:
      return key;
  }
};

const appendKey = (current: string, key: Key): string => {
  if (/^[0-9.]$/.test(key) || key === '00') {
    const currentNumber = current.split(/[+*/-]/).pop() ?? '';
    if (key === '.' && currentNumber.includes('.')) return current;
    if (!current && key === '.') return '0.';
    if (currentNumber === '0' && key !== '.') {
      return current.slice(0, -currentNumber.length) + key;
    }
    return current + key;
  }

  if (!OPERATOR_KEYS.has(key)) return current;

  if (!current) return key === '-' ? '-' : current;
  if (OPERATOR_KEYS.has(current.at(-1) as Key)) {
    return current.slice(0, -1) + key;
  }

  return current + key;
};

export const AmountKeypad: React.FC<AmountKeypadProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement | null)?.closest('.quick-entry-amount-trigger')) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const result = evaluateCalculatorExpression(value);
  const handleKey = (key: Key) => {
    if (key === 'clear') {
      onChange('');
      return;
    }
    if (key === 'backspace') {
      onChange((current) => current.slice(0, -1));
      return;
    }
    if (key === 'equals') {
      onChange((current) => {
        const evaluated = evaluateCalculatorExpression(current);
        return evaluated === null ? current : formatCalculatorResult(evaluated);
      });
      return;
    }

    onChange((current) => appendKey(current, key));
  };

  const displayValue = result !== null ? formatCalculatorResult(result) : value || '0';

  return (
    <div className={`quick-entry-amount-keypad-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="quick-entry-amount-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="quick-entry-amount-result">{displayValue}</span>

      </button>

      {open && (
        <div className="quick-entry-amount-keypad-backdrop">
          <div
            ref={panelRef}
            className="quick-entry-amount-keypad"
            role="dialog"
            aria-label="Amount calculator"
          >
            <div className="quick-entry-amount-display">
              <span className="quick-entry-amount-display-result">
                {result !== null ? formatCalculatorResult(result) : value || '0'}
              </span>
              {value && (
                <span className="quick-entry-amount-display-expression">
                  {displayCalculatorExpression(value)}
                </span>
              )}
            </div>

            <div className="quick-entry-amount-keypad-grid">
              {(
                [
                  ['clear', 'quick-entry-amount-keypad-action'],
                  ['backspace', 'quick-entry-amount-keypad-action'],
                  ['equals', 'quick-entry-amount-keypad-equals'],
                  ['/', 'quick-entry-amount-keypad-operator'],
                  ['7', ''],
                  ['8', ''],
                  ['9', ''],
                  ['*', 'quick-entry-amount-keypad-operator'],
                  ['4', ''],
                  ['5', ''],
                  ['6', ''],
                  ['-', 'quick-entry-amount-keypad-operator'],
                  ['1', ''],
                  ['2', ''],
                  ['3', ''],
                  ['+', 'quick-entry-amount-keypad-operator'],
                  ['00', 'quick-entry-amount-keypad-zero'],
                  ['0', 'quick-entry-amount-keypad-zero'],
                  ['.', ''],
                  ['done', 'quick-entry-amount-keypad-done'],
                ] as [Key, string][]
              ).map(([key, extraClass]) => (
                <button
                  key={key}
                  type="button"
                  className={extraClass}
                  onClick={() => {
                    if (key === 'done') {
                      setOpen(false);
                      return;
                    }
                    handleKey(key);
                  }}
                >
                  {labelForKey(key)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
