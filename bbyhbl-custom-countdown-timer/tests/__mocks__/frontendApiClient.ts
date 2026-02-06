// Centralized mock for repository_after/frontend/src/api/client.ts
// Mapped via jest.frontend.config.js so imports like "../api/client" in the
// frontend code resolve here during tests.

export const countdownApi = {
  create: jest.fn(),
  getBySlug: jest.fn(),
  getUserCountdowns: jest.fn(),
  getPublicCountdowns: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

export const unsplashApi = {
  search: jest.fn(),
};

export const authApi = {
  register: jest.fn(),
  login: jest.fn(),
  getMe: jest.fn(),
};
