import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders the Investy brand', () => {
    render(<App />);
    expect(screen.getByText('Investy')).toBeTruthy();
  });
});
