class SchemaValidator {
  constructor() {
    this.customValidators = {};
  }

  registerValidator(name, fn) {
    this.customValidators[name] = fn;
  }

  validate(schema, data) {
    const errors = [];
    // Basic type check only
    if (schema.type && typeof data !== schema.type) {
      errors.push({
        path: '',
        constraint: 'type',
        message: `Expected type ${schema.type} but got ${typeof data}`
      });
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = { SchemaValidator };
