import "@testing-library/jest-dom";

// Silence Next.js cache revalidate in unit tests
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
