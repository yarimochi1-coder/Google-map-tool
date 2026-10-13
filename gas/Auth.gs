// API Key validation
// Set your API key in Script Properties: File > Project Properties > Script Properties
// Key: API_KEY, Value: your_secret_key

function validateApiKey(key) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) {
    // 合言葉が未設定なら誰も通さない（設定漏れでデータが丸見えになるのを防ぐ）
    return false;
  }
  return typeof key === 'string' && key === storedKey;
}
