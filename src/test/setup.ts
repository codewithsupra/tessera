import '@testing-library/jest-dom/vitest'

// jsdom has no layout engine; the router's scroll restoration calls this.
window.scrollTo = () => {}
