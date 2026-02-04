describe('SQL Injection Prevention Tests', () => {
  
  describe('Parameterized Query Protection', () => {
    test('Should use parameterized queries for user input', () => {
      // Mock database query builder with parameterization
      const buildQuery = (table: string, conditions: Record<string, any>) => {
        const whereClause = Object.keys(conditions)
          .map(key => `${key} = ?`)
          .join(' AND ');
        const values = Object.values(conditions);
        
        return {
          query: `SELECT * FROM ${table} WHERE ${whereClause}`,
          values
        };
      };
      
      const userInput = {
        email: "user@test.com'; DROP TABLE users; --",
        id: "1 OR 1=1"
      };
      
      const query = buildQuery('users', userInput);
      
      // Query should be parameterized, not concatenated
      expect(query.query).toBe('SELECT * FROM users WHERE email = ? AND id = ?');
      expect(query.values).toEqual(['user@test.com\'; DROP TABLE users; --', '1 OR 1=1']);
      
      // Values should be escaped when actually executed
      expect(query.values[0]).toContain('DROP TABLE'); // Raw input preserved for parameter binding
    });

    test('Should prevent SQL injection in booking queries', () => {
      const buildBookingQuery = (filters: any) => {
        const conditions = [];
        const values = [];
        
        if (filters.customerEmail) {
          conditions.push('customerEmail = ?');
          values.push(filters.customerEmail);
        }
        
        if (filters.providerId) {
          conditions.push('providerId = ?');
          values.push(filters.providerId);
        }
        
        if (filters.status) {
          conditions.push('status = ?');
          values.push(filters.status);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        return {
          query: `SELECT * FROM bookings ${whereClause}`,
          values
        };
      };
      
      const maliciousFilters = {
        customerEmail: "test@example.com'; DELETE FROM bookings; --",
        providerId: "1; DROP TABLE providers; --",
        status: "confirmed'; UPDATE bookings SET status = 'cancelled'; --"
      };
      
      const query = buildBookingQuery(maliciousFilters);
      
      // Should be properly parameterized
      expect(query.query).toContain('customerEmail = ?');
      expect(query.query).toContain('providerId = ?');
      expect(query.query).toContain('status = ?');
      expect(query.query).not.toContain('DELETE');
      expect(query.query).not.toContain('DROP');
      expect(query.query).not.toContain('UPDATE');
    });
  });

  describe('Input Sanitization', () => {
    test('Should sanitize SQL special characters', () => {
      const sanitizeInput = (input: string): string => {
        return input
          .replace(/'/g, "''") // Escape single quotes
          .replace(/\\/g, '\\\\') // Escape backslashes
          .replace(/%/g, '\\%') // Escape wildcard characters
          .replace(/_/g, '\\_'); // Escape wildcard characters
      };
      
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; DELETE FROM bookings; WHERE '1'='1",
        "'; UPDATE users SET password = 'hacked'; --",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "' UNION SELECT * FROM sensitive_data --",
        "'; EXEC xp_cmdshell('format c:'); --",
        "'; SHUTDOWN; --",
        "'; ALTER TABLE users DROP COLUMN password; --",
        "'; CREATE TABLE backdoor (id INT, data TEXT); --"
      ];
      
      maliciousInputs.forEach(input => {
        const sanitized = sanitizeInput(input);
        
        // Should escape dangerous characters
        expect(sanitized).toContain("''");
        expect(sanitized).not.toMatch(/(?<!')'(?!')/); // No unescaped single quotes
        
        // Should preserve the content but make it safe
        expect(sanitized.length).toBeGreaterThan(0);
      });
    });

    test('Should handle null and undefined inputs safely', () => {
      const sanitizeInput = (input: any): string => {
        if (input === null || input === undefined) {
          return '';
        }
        if (typeof input !== 'string') {
          return String(input);
        }
        return input.replace(/'/g, "''");
      };
      
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
      expect(sanitizeInput(123)).toBe('123');
      expect(sanitizeInput(true)).toBe('true');
    });
  });

  describe('Query Builder Security', () => {
    test('Should validate table and column names', () => {
      const validateIdentifier = (identifier: string): boolean => {
        // Only allow alphanumeric characters, underscores, and no SQL keywords
        return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier) &&
               !['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER']
                .includes(identifier.toUpperCase());
      };
      
      const validIdentifiers = [
        'users',
        'bookings',
        'provider_profiles',
        'customer_email',
        'id',
        'created_at'
      ];
      
      const invalidIdentifiers = [
        'users; DROP TABLE users; --',
        'bookings` DELETE FROM bookings; --',
        '1; SELECT * FROM users',
        'users OR 1=1',
        'SELECT',
        'DROP',
        'users--',
        'users/*',
        'users#'
      ];
      
      validIdentifiers.forEach(identifier => {
        expect(validateIdentifier(identifier)).toBe(true);
      });
      
      invalidIdentifiers.forEach(identifier => {
        expect(validateIdentifier(identifier)).toBe(false);
      });
    });

    test('Should prevent ORDER BY injection', () => {
      const buildOrderBy = (column: string, direction: 'ASC' | 'DESC' = 'ASC') => {
        const validColumns = ['id', 'created_at', 'updated_at', 'customer_email', 'status'];
        const validDirections = ['ASC', 'DESC'];
        
        if (!validColumns.includes(column)) {
          throw new Error('Invalid column for ORDER BY');
        }
        
        if (!validDirections.includes(direction)) {
          throw new Error('Invalid direction for ORDER BY');
        }
        
        return `ORDER BY ${column} ${direction}`;
      };
      
      // Valid cases
      expect(buildOrderBy('id', 'ASC')).toBe('ORDER BY id ASC');
      expect(buildOrderBy('created_at', 'DESC')).toBe('ORDER BY created_at DESC');
      
      // Invalid cases
      expect(() => buildOrderBy('id; DROP TABLE users; --', 'ASC')).toThrow();
      expect(() => buildOrderBy('id', 'ASC; DELETE FROM users; --' as any)).toThrow();
      expect(() => buildOrderBy('invalid_column', 'ASC')).toThrow();
    });
  });

  describe('Stored Procedure Protection', () => {
    test('Should validate stored procedure parameters', () => {
      const callStoredProcedure = (procedureName: string, params: any[]) => {
        const validProcedures = ['get_bookings', 'create_booking', 'update_booking_status'];
        
        if (!validProcedures.includes(procedureName)) {
          throw new Error('Invalid stored procedure');
        }
        
        // Validate parameters
        const sanitizedParams = params.map(param => {
          if (typeof param === 'string') {
            return param.replace(/'/g, "''");
          }
          return param;
        });
        
        return {
          query: `CALL ${procedureName}(${sanitizedParams.map(() => '?').join(', ')})`,
          values: sanitizedParams
        };
      };
      
      // Valid call
      const validCall = callStoredProcedure('get_bookings', ['user@test.com', '2024-01-01']);
      expect(validCall.query).toBe('CALL get_bookings(?, ?)');
      
      // Invalid procedure name
      expect(() => callStoredProcedure('drop_users; DROP TABLE users; --', [])).toThrow();
      
      // Parameters with injection attempts
      const maliciousCall = callStoredProcedure('get_bookings', [
        "user@test.com'; DROP TABLE users; --",
        "2024-01-01'; DELETE FROM bookings; --"
      ]);
      expect(maliciousCall.values[0]).toContain("''");
    });
  });

  describe('Dynamic Query Protection', () => {
    test('Should prevent injection in dynamic WHERE clauses', () => {
      const buildWhereClause = (conditions: Array<{ field: string; operator: string; value: any }>) => {
        const validOperators = ['=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
        const validFields = ['id', 'customer_email', 'status', 'created_at'];
        
        const clauses: string[] = [];
        const values: any[] = [];
        
        conditions.forEach(condition => {
          if (!validFields.includes(condition.field)) {
            throw new Error(`Invalid field: ${condition.field}`);
          }
          
          if (!validOperators.includes(condition.operator)) {
            throw new Error(`Invalid operator: ${condition.operator}`);
          }
          
          let clause = `${condition.field} ${condition.operator}`;
          
          if (condition.operator === 'IN') {
            const placeholders = condition.value.map(() => '?').join(', ');
            clause += ` (${placeholders})`;
            values.push(...condition.value);
          } else {
            clause += ' ?';
            values.push(condition.value);
          }
          
          clauses.push(clause);
        });
        
        return {
          whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
          values
        };
      };
      
      // Valid conditions
      const validConditions = [
        { field: 'customer_email', operator: '=', value: 'test@example.com' },
        { field: 'status', operator: 'IN', value: ['confirmed', 'pending'] }
      ];
      
      const validQuery = buildWhereClause(validConditions);
      expect(validQuery.whereClause).toBe('WHERE customer_email = ? AND status IN (?, ?)');
      
      // Invalid field
      expect(() => buildWhereClause([
        { field: 'id; DROP TABLE users; --', operator: '=', value: 1 }
      ])).toThrow('Invalid field');
      
      // Invalid operator
      expect(() => buildWhereClause([
        { field: 'id', operator: '; DELETE FROM users; --', value: 1 }
      ])).toThrow('Invalid operator');
    });
  });

  describe('ORM/Query Builder Security', () => {
    test('Should use ORM methods safely', () => {
      // Mock ORM query builder
      class MockQueryBuilder {
        private table: string;
        private conditions: Array<{ field: string; value: any }> = [];
        
        constructor(table: string) {
          this.table = table;
        }
        
        where(field: string, value: any) {
          // Validate field name
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
            throw new Error('Invalid field name');
          }
          
          this.conditions.push({ field, value });
          return this;
        }
        
        build() {
          const whereClause = this.conditions.length > 0 
            ? `WHERE ${this.conditions.map(c => `${c.field} = ?`).join(' AND ')}`
            : '';
          
          return {
            query: `SELECT * FROM ${this.table} ${whereClause}`,
            values: this.conditions.map(c => c.value)
          };
        }
      }
      
      const query = new MockQueryBuilder('bookings')
        .where('customer_email', 'test@example.com')
        .where('status', 'confirmed')
        .build();
      
      expect(query.query).toBe('SELECT * FROM bookings WHERE customer_email = ? AND status = ?');
      expect(query.values).toEqual(['test@example.com', 'confirmed']);
      
      // Should reject invalid field names
      expect(() => new MockQueryBuilder('bookings').where('id; DROP TABLE users; --', 1)).toThrow();
    });
  });

  describe('Database Connection Security', () => {
    test('Should use least privilege database users', () => {
      const getDbPermissions = (userType: string) => {
        const permissions = {
          'web_app': ['SELECT', 'INSERT', 'UPDATE'],
          'reporting': ['SELECT'],
          'admin': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP']
        };
        
        return permissions[userType as keyof typeof permissions] || [];
      };
      
      const webAppPerms = getDbPermissions('web_app');
      const reportingPerms = getDbPermissions('reporting');
      
      // Web app should not have dangerous permissions
      expect(webAppPerms).not.toContain('DELETE');
      expect(webAppPerms).not.toContain('DROP');
      expect(webAppPerms).not.toContain('ALTER');
      
      // Reporting should only have read access
      expect(reportingPerms).toEqual(['SELECT']);
    });

    test('Should validate connection strings', () => {
      const validateConnectionString = (connStr: string) => {
        // Should not contain multiple connection strings
        if (connStr.split(';').length > 10) {
          return false;
        }
        
        // Should not contain dangerous parameters
        const dangerousParams = ['cmd', 'exec', 'shell', 'script'];
        const lowerConnStr = connStr.toLowerCase();
        
        return !dangerousParams.some(param => lowerConnStr.includes(param));
      };
      
      const validConnStr = 'Server=localhost;Database=booking_db;User Id=webapp;Password=secure;';
      const invalidConnStr = 'Server=localhost;Database=booking_db;User Id=webapp;Password=secure;cmd=dir;';
      
      expect(validateConnectionString(validConnStr)).toBe(true);
      expect(validateConnectionString(invalidConnStr)).toBe(false);
    });
  });

  describe('Error Message Security', () => {
    test('Should not expose database details in error messages', () => {
      const sanitizeError = (error: Error) => {
        const message = error.message;
        
        // Remove database-specific details
        const sanitized = message
          .replace(/Table\s+'[^']+'\s+doesn't exist/g, 'Table not found')
          .replace(/Column\s+'[^']+'\s+doesn't exist/g, 'Column not found')
          .replace(/Syntax error near\s+'[^']*'/g, 'Invalid query syntax')
          .replace(/Duplicate entry\s+'[^']*'/g, 'Duplicate entry');
        
        return new Error(sanitized);
      };
      
      const dbError = new Error("Table 'users' doesn't exist");
      const sanitized = sanitizeError(dbError);
      
      expect(sanitized.message).toBe('Table not found');
      expect(sanitized.message).not.toContain('users');
    });
  });

  describe('Logging and Monitoring', () => {
    test('Should log suspicious query patterns', () => {
      const suspiciousPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i,
        /union\s+select/i,
        /exec\s*\(/i,
        /xp_cmdshell/i,
        /sp_executesql/i
      ];
      
      const logSuspiciousQuery = (query: string) => {
        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(query));
        
        if (isSuspicious) {
          return true;
        }
        
        return false;
      };
      
      const normalQuery = 'SELECT * FROM bookings WHERE customer_email = ?';
      const suspiciousQuery = 'SELECT * FROM users; DROP TABLE users; --';
      
      expect(logSuspiciousQuery(normalQuery)).toBe(false);
      expect(logSuspiciousQuery(suspiciousQuery)).toBe(true);
    });
  });
});
