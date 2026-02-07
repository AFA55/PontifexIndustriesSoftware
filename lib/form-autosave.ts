/**
 * Form Auto-Save Utilities
 * Handles saving and loading form state from localStorage
 */

const STORAGE_PREFIX = 'pontifex_form_';
const EXPIRY_HOURS = 24; // Auto-save expires after 24 hours

export interface SavedFormState<T> {
  data: T;
  currentStep: number;
  timestamp: number;
  version: string; // Form version to handle schema changes
}

/**
 * Save form state to localStorage
 */
export function saveFormState<T>(
  formKey: string,
  data: T,
  currentStep: number,
  version: string = '1.0'
): void {
  try {
    const state: SavedFormState<T> = {
      data,
      currentStep,
      timestamp: Date.now(),
      version,
    };

    localStorage.setItem(
      `${STORAGE_PREFIX}${formKey}`,
      JSON.stringify(state)
    );
  } catch (error) {
    console.error('Error saving form state:', error);
  }
}

/**
 * Load form state from localStorage
 */
export function loadFormState<T>(
  formKey: string,
  currentVersion: string = '1.0'
): SavedFormState<T> | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${formKey}`);

    if (!stored) {
      return null;
    }

    const state: SavedFormState<T> = JSON.parse(stored);

    // Check if saved data has expired
    const hoursElapsed = (Date.now() - state.timestamp) / (1000 * 60 * 60);
    if (hoursElapsed > EXPIRY_HOURS) {
      clearFormState(formKey);
      return null;
    }

    // Check version compatibility
    if (state.version !== currentVersion) {
      console.warn('Saved form version mismatch. Clearing old data.');
      clearFormState(formKey);
      return null;
    }

    return state;
  } catch (error) {
    console.error('Error loading form state:', error);
    return null;
  }
}

/**
 * Clear saved form state
 */
export function clearFormState(formKey: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${formKey}`);
  } catch (error) {
    console.error('Error clearing form state:', error);
  }
}

/**
 * Check if saved form state exists
 */
export function hasSavedFormState(formKey: string): boolean {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${formKey}`);
    if (!stored) return false;

    const state = JSON.parse(stored);
    const hoursElapsed = (Date.now() - state.timestamp) / (1000 * 60 * 60);

    return hoursElapsed <= EXPIRY_HOURS;
  } catch (error) {
    return false;
  }
}

/**
 * Get the age of saved form state in a human-readable format
 */
export function getSavedFormAge(formKey: string): string | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${formKey}`);
    if (!stored) return null;

    const state = JSON.parse(stored);
    const minutesElapsed = Math.floor((Date.now() - state.timestamp) / (1000 * 60));

    if (minutesElapsed < 1) {
      return 'just now';
    } else if (minutesElapsed < 60) {
      return `${minutesElapsed} minute${minutesElapsed !== 1 ? 's' : ''} ago`;
    } else {
      const hoursElapsed = Math.floor(minutesElapsed / 60);
      return `${hoursElapsed} hour${hoursElapsed !== 1 ? 's' : ''} ago`;
    }
  } catch (error) {
    return null;
  }
}
