// Configuration for remote/local backend URLs

const CONFIG = {
  API_BASE_URL: 'http://13.51.197.179:3000',
  APP_NAME: 'Student ERP',
  VERSION: '1.0.0'
};

// Helper function to make API calls with the configured base URL
async function apiCall(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}/api${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to call ${url}:`, error);
    throw error;
  }
}