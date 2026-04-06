// API Key validation
// Set your API key in Script Properties: File > Project Properties > Script Properties
// Key: API_KEY, Value: your_secret_key

function validateApiKey(key) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) {
    // If no API key is set, allow all requests (initial setup)
    return true;
  }
  return key === storedKey;
}
