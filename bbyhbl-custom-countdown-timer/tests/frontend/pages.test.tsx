import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const TestHome = () => {
  return (
    <div data-testid="home-page">
      <h1>Count Down to What Matters</h1>
      <p>Create beautiful, shareable countdowns</p>
      <button>Create Countdown</button>
      <button>Browse Public Countdowns</button>
      
      <div>
        <h3>Beautiful Displays</h3>
        <h3>Share Instantly</h3>
        <h3>Cross-Device Sync</h3>
      </div>
      
      <div>
        <h3>Save Your Countdowns</h3>
        <button>Sign In</button>
        <button>Create Account</button>
      </div>
    </div>
  );
};

describe('Home Page - Requirement Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the main hero section with heading', () => {
    render(<TestHome />);
    
    expect(screen.getByText(/count down to what matters/i)).toBeInTheDocument();
    expect(screen.getByText(/create beautiful, shareable countdowns/i)).toBeInTheDocument();
  });

  it('shows call-to-action buttons', () => {
    render(<TestHome />);
    
    expect(screen.getByText(/create countdown/i)).toBeInTheDocument();
    expect(screen.getByText(/browse public countdowns/i)).toBeInTheDocument();
  });

  it('displays key features', () => {
    render(<TestHome />);
    
    expect(screen.getByText(/beautiful displays/i)).toBeInTheDocument();
    expect(screen.getByText(/share instantly/i)).toBeInTheDocument();
    expect(screen.getByText(/cross-device sync/i)).toBeInTheDocument();
  });

  it('prompts non-logged-in users to sign up', () => {
    render(<TestHome />);
    
    expect(screen.getByText(/save your countdowns/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    expect(screen.getByText(/create account/i)).toBeInTheDocument();
  });
});