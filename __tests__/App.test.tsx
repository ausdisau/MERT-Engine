import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import App from '../App';

jest.useFakeTimers();

describe('MERT Engine app', () => {
  test('exposes actions through accessible roles and names', async () => {
    await render(<App />);

    expect(screen.getByRole('button', { name: 'Restore communication and positioning access' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Escalate to senior support' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose diagnostic overshadowing branch' })).toBeOnTheScreen();
  });

  test('restores AAC through the user-visible action', async () => {
    const user = userEvent.setup();
    await render(<App />);

    await user.press(screen.getByRole('button', { name: 'Restore communication and positioning access' }));

    expect(screen.getByText(/AAC: AVAILABLE · RELIABLE/)).toBeOnTheScreen();
    expect(screen.getByText(/Decision authority: Maya Chen/)).toBeOnTheScreen();
  });
});
