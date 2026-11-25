// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInlineCalendar } from '../src/inline-calendar';

const labels = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  today: 'Today',
  clear: 'Clear',
};

function fixture(value: string, locale = 'en-US', doc = document) {
  const onSelect = vi.fn();
  const calendar = createInlineCalendar(doc, { value, locale, labels, onSelect });
  const { element } = calendar;
  const day = (value: string) => element.querySelector<HTMLButtonElement>(`[data-date="${value}"]`);
  const nav = (name: string) => element.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
  return { ...calendar, onSelect, day, nav };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('inline calendar', () => {
  it('navigates across year boundaries without emitting a selection', () => {
    const { element, day, nav, onSelect } = fixture('2024-12-31');
    expect(element.querySelector('.zb-calendar-title')?.textContent).toBe('December 2024');
    expect(day('2024-12-31')?.getAttribute('aria-pressed')).toBe('true');
    nav(labels.nextMonth).click();
    expect(element.querySelector('.zb-calendar-title')?.textContent).toBe('January 2025');
    expect(day('2025-01-01')).not.toBeNull();
    nav(labels.previousMonth).click();
    expect(day('2024-12-31')?.getAttribute('aria-pressed')).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects an exact ISO leap day and does not replace the focused day button', () => {
    const { element, day, onSelect, setValue } = fixture('2000-02-01');
    document.body.append(element);
    const leap = day('2000-02-29')!;
    expect(leap.textContent).toBe('29');
    expect(leap.getAttribute('aria-label')).toContain('February 29, 2000');
    leap.focus();
    leap.click();
    expect(onSelect.mock.calls).toEqual([['2000-02-29']]);
    expect(leap.getAttribute('aria-pressed')).toBe('true');
    expect(day('2000-02-01')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(leap);

    setValue('1900-02-28');
    expect(day('1900-02-28')?.getAttribute('aria-pressed')).toBe('true');
    expect(day('1900-02-29')).toBeNull();
    setValue('1900-02-29');
    expect(day('1900-02-28')?.getAttribute('aria-pressed')).toBe('false');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('changes week headings and leading day positions for the locale', () => {
    const us = fixture('2024-09-01'); // Sunday.
    const cn = fixture('2024-09-01', 'zh-CN');
    expect(us.element.querySelector('.zb-calendar-weekday')?.textContent).toBe('Sun');
    expect(cn.element.querySelector('.zb-calendar-weekday')?.textContent).toBe('周一');
    expect(us.element.querySelectorAll('.zb-calendar-blank')).toHaveLength(0);
    expect(cn.element.querySelectorAll('.zb-calendar-blank')).toHaveLength(6);
  });

  it('uses a local day for Today and sends a null draft for Clear', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 23, 45));
    const { element, onSelect, day } = fixture('2024-02-29');
    const [today, clear] = element.querySelectorAll<HTMLButtonElement>(
      '.zb-calendar-footer button',
    );
    today!.click();
    const selected = day('2025-01-01');
    expect(selected?.getAttribute('aria-current')).toBe('date');
    expect(selected?.getAttribute('aria-pressed')).toBe('true');
    clear!.click();
    expect(selected?.getAttribute('aria-pressed')).toBe('false');
    expect(onSelect.mock.calls).toEqual([['2025-01-01'], [null]]);
  });

  it('uses native XHTML buttons in an XML host and bounds navigation to four-digit years', () => {
    const doc = document.implementation.createDocument(
      'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
      'window',
    );
    const { element, day, nav, setValue } = fixture('0000-01-01', 'en-US', doc);
    expect(element.ownerDocument).toBe(doc);
    expect(day('0000-01-01')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    expect(nav(labels.previousMonth).disabled).toBe(true);
    nav(labels.nextMonth).click();
    expect(day('0000-02-29')).not.toBeNull();
    setValue('9999-12-31');
    expect(nav(labels.nextMonth).disabled).toBe(true);
    expect(day('9999-12-31')?.getAttribute('aria-pressed')).toBe('true');
  });
});
