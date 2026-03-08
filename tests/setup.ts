// Only load jest-dom matchers in jsdom environment
if (typeof window !== 'undefined') {
  import('@testing-library/jest-dom')
}
