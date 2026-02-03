import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemperatureCalculator from '../repository_before/src/components/TemperatureCalculator';

describe('TemperatureCalculator Infrastructure', () => {
  test('component renders without crashing', () => {
    render(<TemperatureCalculator />);
  });

  test('both temperature inputs are present', () => {
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    const fahrenheitInput = screen.getByDisplayValue('');
    
    expect(celsiusInput).toBeInTheDocument();
    expect(fahrenheitInput).toBeInTheDocument();
  });

  test('can type in celsius input', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '100');
    
    expect(celsiusInput).toHaveValue('100');
  });

  test('can type in fahrenheit input', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '212');
    
    expect(fahrenheitInput).toHaveValue('212');
  });
});

describe('Celsius to Fahrenheit Conversion', () => {
  test('0°C converts to 32.00°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '0');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('32.00');
  });

  test('100°C converts to 212.00°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '100');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('212.00');
  });

  test('-40°C converts to -40.00°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '-40');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('-40.00');
  });

  test('-20°C converts to -4.00°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '-20');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('-4.00');
  });

  test('37°C converts to 98.60°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '37');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('98.60');
  });

  test('25.5°C converts to 77.90°F', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '25.5');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('77.90');
  });

  test('clearing celsius input clears fahrenheit input', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, '100');
    
    // Verify conversion happened
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(fahrenheitInput).toHaveValue('212.00');
    
    // Clear the input
    await user.clear(celsiusInput);
    
    // Both should be empty
    expect(celsiusInput).toHaveValue('');
    expect(fahrenheitInput).toHaveValue('');
  });

  test('non-numeric input clears both inputs', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    await user.type(celsiusInput, 'abc');
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    expect(celsiusInput).toHaveValue('abc');
    expect(fahrenheitInput).toHaveValue('');
  });
});

describe('Fahrenheit to Celsius Conversion', () => {
  test('32°F converts to 0.00°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '32');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('0.00');
  });

  test('212°F converts to 100.00°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '212');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('100.00');
  });

  test('-40°F converts to -40.00°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '-40');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('-40.00');
  });

  test('-4°F converts to -20.00°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '-4');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('-20.00');
  });

  test('98.6°F converts to 37.00°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '98.6');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('37.00');
  });

  test('77.9°F converts to 25.50°C', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '77.9');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('25.50');
  });

  test('clearing fahrenheit input clears celsius input', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, '212');
    
    // Verify conversion happened
    const celsiusInput = screen.getByDisplayValue('');
    expect(celsiusInput).toHaveValue('100.00');
    
    // Clear the input
    await user.clear(fahrenheitInput);
    
    // Both should be empty
    expect(fahrenheitInput).toHaveValue('');
    expect(celsiusInput).toHaveValue('');
  });

  test('non-numeric fahrenheit input clears celsius input', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    await user.type(fahrenheitInput, 'xyz');
    
    const celsiusInput = screen.getByDisplayValue('');
    expect(fahrenheitInput).toHaveValue('xyz');
    expect(celsiusInput).toHaveValue('');
  });
});

describe('Bidirectional Behavior', () => {
  test('celsius and fahrenheit inputs act independently', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    
    // Type in celsius first
    await user.type(celsiusInput, '100');
    expect(fahrenheitInput).toHaveValue('212.00');
    
    // Clear and type in fahrenheit
    await user.clear(celsiusInput);
    await user.clear(fahrenheitInput);
    await user.type(fahrenheitInput, '32');
    expect(celsiusInput).toHaveValue('0.00');
  });

  test('switching source clears previous conversion', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    
    // Start with celsius
    await user.type(celsiusInput, '50');
    expect(fahrenheitInput).toHaveValue('122.00');
    
    // Now type in fahrenheit - should override
    await user.clear(fahrenheitInput);
    await user.type(fahrenheitInput, '68');
    expect(celsiusInput).toHaveValue('20.00');
    expect(fahrenheitInput).toHaveValue('68');
  });

  test('both inputs can be empty simultaneously', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    
    // Both should start empty
    expect(celsiusInput).toHaveValue('');
    expect(fahrenheitInput).toHaveValue('');
    
    // Type then clear celsius
    await user.type(celsiusInput, '100');
    await user.clear(celsiusInput);
    expect(celsiusInput).toHaveValue('');
    expect(fahrenheitInput).toHaveValue('');
    
    // Type then clear fahrenheit
    await user.type(fahrenheitInput, '212');
    await user.clear(fahrenheitInput);
    expect(celsiusInput).toHaveValue('');
    expect(fahrenheitInput).toHaveValue('');
  });

  test('rapid switching between inputs works correctly', async () => {
    const user = userEvent.setup();
    render(<TemperatureCalculator />);
    
    const celsiusInput = screen.getByDisplayValue('');
    const fahrenheitInput = screen.getAllByDisplayValue('')[1];
    
    // Celsius → Fahrenheit
    await user.type(celsiusInput, '0');
    expect(fahrenheitInput).toHaveValue('32.00');
    
    // Clear Celsius, type Fahrenheit
    await user.clear(celsiusInput);
    await user.type(fahrenheitInput, '212');
    expect(celsiusInput).toHaveValue('100.00');
    
    // Clear Fahrenheit, type Celsius again
    await user.clear(fahrenheitInput);
    await user.type(celsiusInput, '-40');
    expect(fahrenheitInput).toHaveValue('-40.00');
  });
});
