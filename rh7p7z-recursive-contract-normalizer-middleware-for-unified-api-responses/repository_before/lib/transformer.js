const SENSITIVE_KEYS = ['ssn', 'password_hash', 'internal_flags', 'credit_card_number'];
const DATE_SUFFIXES = ['_at', '_date', 'timestamp'];

class ResponseTransformer {
  /**
   * Standardizes a response object based on corporate API specs.
   * @param {Object|Array} data - The raw data from upstream services.
   * @returns {Object|Array} - The transformed and sanitized data.
   */
  transform(data) {
    // LEGACY IMPLEMENTATION: Needs full refactor to be recursive and robust.
    if (!data || typeof data !== 'object') return data;

    // Currently only handles top-level shallow objects
    const transformed = {};
    for (let key in data) {
      if (SENSITIVE_KEYS.includes(key)) continue;

      let newKey = key;
      // Very basic snake_to_camel for only one level
      if (key.includes('_')) {
        newKey = key.replace(/([-_][a-z])/g, group =>
          group.toUpperCase().replace('-', '').replace('_', '')
        );
      }

      let value = data[key];
      // Basic date check for top level
      if (DATE_SUFFIXES.some(suffix => key.endsWith(suffix)) && typeof value === 'number') {
        value = new Date(value).toISOString();
      }

      transformed[newKey] = value;
    }
    
    return transformed;
  }
}

// Usage Example:
// const transformer = new ResponseTransformer();
// const rawResponse = { user_id: 101, profile_data: { first_name: "John", ssn: "123-45" } };
// const cleanResponse = transformer.transform(rawResponse);
// Expected: { userId: 101, profileData: { firstName: "John" } }
