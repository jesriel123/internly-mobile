/**
 * Debug Logger Utility for tracking button clicks and API calls
 * All logs are prefixed with [DEBUG] and follow format:
 * [DEBUG] [BUTTON_NAME] - action/status - timestamp
 */

// Track click counts per button
const clickCounts = {};

// Track active requests per button
const activeRequests = {};

/**
 * Log a button click event
 * @param {string} buttonName - Name of the button
 * @param {boolean} isBlocked - Whether the click was blocked due to pending request
 */
export const logButtonClick = (buttonName, isBlocked = false) => {
  if (!clickCounts[buttonName]) {
    clickCounts[buttonName] = 0;
  }
  clickCounts[buttonName]++;
  
  const timestamp = new Date().toISOString();
  const clickNum = clickCounts[buttonName];
  
  console.log(`\n[DEBUG] ========================================`);
  console.log(`[DEBUG] [${buttonName}] - CLICK #${clickNum} - ${timestamp}`);
  
  if (isBlocked) {
    console.log(`[DEBUG] [${buttonName}] - ⚠️ BLOCKED (request in progress) - ${timestamp}`);
  }
  
  return clickNum;
};

/**
 * Log when a button is disabled
 * @param {string} buttonName - Name of the button
 */
export const logButtonDisabled = (buttonName) => {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG] [${buttonName}] - 🔒 DISABLED (blocking future clicks) - ${timestamp}`);
  activeRequests[buttonName] = true;
};

/**
 * Log when a button is re-enabled
 * @param {string} buttonName - Name of the button
 */
export const logButtonEnabled = (buttonName) => {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG] [${buttonName}] - 🔓 RE-ENABLED - ${timestamp}`);
  activeRequests[buttonName] = false;
};

/**
 * Log request start
 * @param {string} buttonName - Name of the button
 * @returns {number} - Start timestamp in milliseconds
 */
export const logRequestStart = (buttonName) => {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();
  console.log(`[DEBUG] [${buttonName}] - 🚀 REQUEST STARTED - ${timestamp}`);
  return startTime;
};

/**
 * Log request success
 * @param {string} buttonName - Name of the button
 * @param {number} startTime - Start timestamp from logRequestStart
 */
export const logRequestSuccess = (buttonName, startTime) => {
  const timestamp = new Date().toISOString();
  const responseTime = Date.now() - startTime;
  console.log(`[DEBUG] [${buttonName}] - ✅ SUCCESS (${responseTime}ms) - ${timestamp}`);
};

/**
 * Log request failure
 * @param {string} buttonName - Name of the button
 * @param {number} startTime - Start timestamp from logRequestStart
 * @param {Error} error - Error object
 */
export const logRequestFailure = (buttonName, startTime, error) => {
  const timestamp = new Date().toISOString();
  const responseTime = Date.now() - startTime;
  console.log(`[DEBUG] [${buttonName}] - ❌ FAILED (${responseTime}ms) - ${timestamp}`);
  console.log(`[DEBUG] [${buttonName}] - Error Code: ${error?.code || 'N/A'}`);
  console.log(`[DEBUG] [${buttonName}] - Error Message: ${error?.message || String(error)}`);
};

/**
 * Check if a button has an active request
 * @param {string} buttonName - Name of the button
 * @returns {boolean}
 */
export const isButtonBusy = (buttonName) => {
  return activeRequests[buttonName] === true;
};

/**
 * Create a wrapped handler with full debug logging
 * @param {string} buttonName - Name of the button
 * @param {Function} handler - The async handler function
 * @param {Object} refs - Object containing isSubmitting ref
 * @param {Function} setLoading - State setter for loading
 * @returns {Function} - Wrapped handler with debug logging
 */
export const createDebugHandler = (buttonName, handler, refs, setLoading) => {
  return async (...args) => {
    const clickNum = logButtonClick(buttonName, refs?.isSubmitting?.current);
    
    // Check if already submitting
    if (refs?.isSubmitting?.current) {
      return;
    }
    
    // Disable button
    if (refs?.isSubmitting) {
      refs.isSubmitting.current = true;
    }
    logButtonDisabled(buttonName);
    
    if (setLoading) {
      setLoading(true);
    }
    
    const startTime = logRequestStart(buttonName);
    
    try {
      const result = await handler(...args);
      logRequestSuccess(buttonName, startTime);
      return result;
    } catch (error) {
      logRequestFailure(buttonName, startTime, error);
      throw error;
    } finally {
      logButtonEnabled(buttonName);
      if (refs?.isSubmitting) {
        refs.isSubmitting.current = false;
      }
      if (setLoading) {
        setLoading(false);
      }
    }
  };
};

export default {
  logButtonClick,
  logButtonDisabled,
  logButtonEnabled,
  logRequestStart,
  logRequestSuccess,
  logRequestFailure,
  isButtonBusy,
  createDebugHandler,
};
