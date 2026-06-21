// Configuration for remote/local backend URLs
// Change API_BASE_URL to point to your remote server

const CONFIG = {
  // Local development (change to your server IP for remote access)
  // API_BASE_URL: 'http://localhost:3000',
  
  // Remote server example (deploy your Express server here)
  API_BASE_URL: 'http://localhost:3000', // Change this to your remote server
  
  // Or use this for production with a domain
  // API_BASE_URL: 'https://your-api.example.com',
  
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
