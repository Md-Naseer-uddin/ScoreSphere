import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../i18n';

// findBy* waits 1 s by default; async form validation can take longer when CI is busy.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
