/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppProvider } from './AppContext';
import MainContent from './MainContent';

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
