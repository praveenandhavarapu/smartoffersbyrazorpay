import { render } from '@testing-library/react';
import { Markdown } from '../components/Markdown';

const SAMPLE = `Here's the picture for the 5 months (12 May – 10 Oct 2026).

**Full 5 months (12 May – 10 Oct)**
- Collected: **₹75,18,879** across 5,220 captured payments.
- Refunds: 187 refunds totalling ₹2,53,616.

1. First
2. Second

| Day | Amount |
| --- | --- |
| 9 Oct | ₹51,719 |`;

describe('Markdown', () => {
  it('renders bold, labels, lists and tables without showing asterisks', () => {
    const { container } = render(<Markdown text={SAMPLE} />);
    expect(container.textContent).not.toContain('**');
    expect(container.querySelector('h4')?.textContent).toBe('Full 5 months (12 May – 10 Oct)');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('₹75,18,879');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });
  it('never renders HTML from the text', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> **hi**'} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
