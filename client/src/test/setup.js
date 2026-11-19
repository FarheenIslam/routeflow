import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import i18n from '../i18n.js';

// Components read real translation keys, so tests assert what a user would see.
await i18n.changeLanguage('en');

afterEach(() => {
  cleanup();
});
