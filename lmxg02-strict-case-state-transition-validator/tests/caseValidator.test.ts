import {
  applyCaseAction,
  Case,
  CaseAction,
  CaseState,
  CaseActionResult,
} from '../repository_after/caseValidator';

function createCase(state: CaseState, overrides: Partial<Case> = {}): Case {
  return {
    id: 'test-case-001',
    state,
    ...overrides,
  };
}

describe('applyCaseAction', () => {
  describe('Valid Transitions', () => {
    test('NEW -> ASSIGNED via ASSIGN', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'ASSIGN', assigneeId: 'user-123' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('ASSIGNED');
        expect(result.updated.assigneeId).toBe('user-123');
        expect(result.applied).toContainEqual({
          code: 'STATE_CHANGED',
          from: 'NEW',
          to: 'ASSIGNED',
        });
        expect(result.applied).toContainEqual({
          code: 'ASSIGNEE_CHANGED',
          from: undefined,
          to: 'user-123',
        });
      }
    });

    test('ASSIGNED -> IN_PROGRESS via START_WORK', () => {
      const caseItem = createCase('ASSIGNED', { assigneeId: 'user-123' });
      const action: CaseAction = { type: 'START_WORK' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('IN_PROGRESS');
        expect(result.applied).toContainEqual({
          code: 'STATE_CHANGED',
          from: 'ASSIGNED',
          to: 'IN_PROGRESS',
        });
      }
    });

    test('ASSIGNED -> WAITING_CUSTOMER via REQUEST_CUSTOMER', () => {
      const caseItem = createCase('ASSIGNED', { assigneeId: 'user-123' });
      const action: CaseAction = { type: 'REQUEST_CUSTOMER' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('WAITING_CUSTOMER');
      }
    });

    test('IN_PROGRESS -> WAITING_CUSTOMER via REQUEST_CUSTOMER', () => {
      const caseItem = createCase('IN_PROGRESS');
      const action: CaseAction = { type: 'REQUEST_CUSTOMER' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('WAITING_CUSTOMER');
      }
    });

    test('IN_PROGRESS -> RESOLVED via RESOLVE', () => {
      const caseItem = createCase('IN_PROGRESS');
      const action: CaseAction = { type: 'RESOLVE', resolutionNote: 'Fixed the issue' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('RESOLVED');
        expect(result.updated.resolutionNote).toBe('Fixed the issue');
        expect(result.applied).toContainEqual({
          code: 'NOTE_ADDED',
          to: 'Fixed the issue',
        });
      }
    });

    test('WAITING_CUSTOMER -> IN_PROGRESS via START_WORK', () => {
      const caseItem = createCase('WAITING_CUSTOMER');
      const action: CaseAction = { type: 'START_WORK' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('IN_PROGRESS');
      }
    });

    test('WAITING_CUSTOMER -> RESOLVED via RESOLVE', () => {
      const caseItem = createCase('WAITING_CUSTOMER');
      const action: CaseAction = { type: 'RESOLVE', resolutionNote: 'Customer confirmed fix' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('RESOLVED');
      }
    });

    test('RESOLVED -> CLOSED via CLOSE', () => {
      const caseItem = createCase('RESOLVED');
      const action: CaseAction = { type: 'CLOSE' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('CLOSED');
      }
    });

    test('RESOLVED -> IN_PROGRESS via REOPEN', () => {
      const caseItem = createCase('RESOLVED');
      const action: CaseAction = { type: 'REOPEN', reason: 'Issue recurred' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('IN_PROGRESS');
        expect(result.updated.reopenReason).toBe('Issue recurred');
      }
    });

    test('CLOSED -> IN_PROGRESS via REOPEN', () => {
      const caseItem = createCase('CLOSED');
      const action: CaseAction = { type: 'REOPEN', reason: 'Customer requested reopening' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('IN_PROGRESS');
      }
    });
  });

  describe('Illegal Transitions', () => {
    test('NEW cannot START_WORK directly', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'START_WORK' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'ILLEGAL_TRANSITION' })
        );
      }
    });

    test('NEW cannot RESOLVE directly', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'RESOLVE', resolutionNote: 'test' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'ILLEGAL_TRANSITION' })
        );
      }
    });

    test('NEW cannot CLOSE directly', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'CLOSE' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('ASSIGNED cannot RESOLVE directly', () => {
      const caseItem = createCase('ASSIGNED');
      const action: CaseAction = { type: 'RESOLVE', resolutionNote: 'test' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('IN_PROGRESS cannot CLOSE directly', () => {
      const caseItem = createCase('IN_PROGRESS');
      const action: CaseAction = { type: 'CLOSE' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('CLOSED cannot CLOSE again', () => {
      const caseItem = createCase('CLOSED');
      const action: CaseAction = { type: 'CLOSE' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('CLOSED cannot ASSIGN', () => {
      const caseItem = createCase('CLOSED');
      const action: CaseAction = { type: 'ASSIGN', assigneeId: 'user-456' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });
  });

  describe('Unknown Action Types', () => {
    test('rejects unknown action type with UNKNOWN_ACTION code', () => {
      const caseItem = createCase('NEW');
      const action = { type: 'INVALID_ACTION' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'UNKNOWN_ACTION' })
        );
      }
    });

    test('rejects action with no type', () => {
      const caseItem = createCase('NEW');
      const action = { assigneeId: 'user-123' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'UNKNOWN_ACTION' })
        );
      }
    });

    test('rejects null action', () => {
      const caseItem = createCase('NEW');

      const result = applyCaseAction(caseItem, null);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'UNKNOWN_ACTION' })
        );
      }
    });

    test('rejects undefined action', () => {
      const caseItem = createCase('NEW');

      const result = applyCaseAction(caseItem, undefined);

      expect(result.ok).toBe(false);
    });

    test('rejects string as action', () => {
      const caseItem = createCase('NEW');

      const result = applyCaseAction(caseItem, 'ASSIGN');

      expect(result.ok).toBe(false);
    });
  });

  describe('Missing Required Fields', () => {
    test('ASSIGN without assigneeId returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('NEW');
      const action = { type: 'ASSIGN' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_REQUIRED_FIELD',
            field: 'assigneeId',
          })
        );
      }
    });

    test('ASSIGN with empty assigneeId returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('NEW');
      const action = { type: 'ASSIGN', assigneeId: '' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_REQUIRED_FIELD',
            field: 'assigneeId',
          })
        );
      }
    });

    test('ASSIGN with whitespace-only assigneeId returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('NEW');
      const action = { type: 'ASSIGN', assigneeId: '   ' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('RESOLVE without resolutionNote returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('IN_PROGRESS');
      const action = { type: 'RESOLVE' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_REQUIRED_FIELD',
            field: 'resolutionNote',
          })
        );
      }
    });

    test('RESOLVE with empty resolutionNote returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('IN_PROGRESS');
      const action = { type: 'RESOLVE', resolutionNote: '' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });

    test('REOPEN without reason returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('RESOLVED');
      const action = { type: 'REOPEN' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContainEqual(
          expect.objectContaining({
            code: 'MISSING_REQUIRED_FIELD',
            field: 'reason',
          })
        );
      }
    });

    test('REOPEN with empty reason returns MISSING_REQUIRED_FIELD', () => {
      const caseItem = createCase('RESOLVED');
      const action = { type: 'REOPEN', reason: '' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
    });
  });

  describe('Multiple Validation Issues', () => {
    test('returns both MISSING_REQUIRED_FIELD and ILLEGAL_TRANSITION when applicable', () => {
      const caseItem = createCase('CLOSED');
      const action = { type: 'ASSIGN' }; // Missing assigneeId AND illegal from CLOSED

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.length).toBeGreaterThanOrEqual(2);
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' })
        );
        expect(result.reasons).toContainEqual(
          expect.objectContaining({ code: 'ILLEGAL_TRANSITION' })
        );
      }
    });
  });

  describe('Immutability', () => {
    test('does not mutate the input case object', () => {
      const caseItem = createCase('NEW');
      const originalState = caseItem.state;
      const originalId = caseItem.id;
      const action: CaseAction = { type: 'ASSIGN', assigneeId: 'user-123' };

      applyCaseAction(caseItem, action);

      expect(caseItem.state).toBe(originalState);
      expect(caseItem.id).toBe(originalId);
      expect(caseItem.assigneeId).toBeUndefined();
    });

    test('returns a new case object on success', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'ASSIGN', assigneeId: 'user-123' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated).not.toBe(caseItem);
      }
    });

    test('preserves existing case properties in updated object', () => {
      const caseItem = createCase('ASSIGNED', {
        assigneeId: 'existing-user',
        resolutionNote: 'previous note',
      });
      const action: CaseAction = { type: 'START_WORK' };

      const result = applyCaseAction(caseItem, action);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.id).toBe(caseItem.id);
        expect(result.updated.assigneeId).toBe('existing-user');
        expect(result.updated.resolutionNote).toBe('previous note');
      }
    });
  });

  describe('Determinism', () => {
    test('same input produces same output', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'ASSIGN', assigneeId: 'user-123' };

      const result1 = applyCaseAction(caseItem, action);
      const result2 = applyCaseAction(caseItem, action);

      expect(result1).toEqual(result2);
    });

    test('same invalid input produces same error', () => {
      const caseItem = createCase('NEW');
      const action: CaseAction = { type: 'CLOSE' };

      const result1 = applyCaseAction(caseItem, action);
      const result2 = applyCaseAction(caseItem, action);

      expect(result1).toEqual(result2);
    });
  });

  describe('Complete Workflow', () => {
    test('full case lifecycle: NEW -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
      let caseItem = createCase('NEW');

      // Assign
      let result = applyCaseAction(caseItem, { type: 'ASSIGN', assigneeId: 'agent-001' });
      expect(result.ok).toBe(true);
      if (result.ok) caseItem = result.updated;

      // Start work
      result = applyCaseAction(caseItem, { type: 'START_WORK' });
      expect(result.ok).toBe(true);
      if (result.ok) caseItem = result.updated;

      // Resolve
      result = applyCaseAction(caseItem, { type: 'RESOLVE', resolutionNote: 'Issue resolved' });
      expect(result.ok).toBe(true);
      if (result.ok) caseItem = result.updated;

      // Close
      result = applyCaseAction(caseItem, { type: 'CLOSE' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('CLOSED');
      }
    });

    test('workflow with customer waiting: ASSIGNED -> WAITING -> IN_PROGRESS -> RESOLVED', () => {
      let caseItem = createCase('ASSIGNED', { assigneeId: 'agent-001' });

      // Request customer input
      let result = applyCaseAction(caseItem, { type: 'REQUEST_CUSTOMER' });
      expect(result.ok).toBe(true);
      if (result.ok) caseItem = result.updated;

      // Customer responds, continue work
      result = applyCaseAction(caseItem, { type: 'START_WORK' });
      expect(result.ok).toBe(true);
      if (result.ok) caseItem = result.updated;

      // Resolve
      result = applyCaseAction(caseItem, { type: 'RESOLVE', resolutionNote: 'Fixed after customer input' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('RESOLVED');
      }
    });

    test('reopen workflow: CLOSED -> IN_PROGRESS via REOPEN', () => {
      const caseItem = createCase('CLOSED');
      const result = applyCaseAction(caseItem, { type: 'REOPEN', reason: 'Issue returned' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updated.state).toBe('IN_PROGRESS');
        expect(result.updated.reopenReason).toBe('Issue returned');
      }
    });
  });

  describe('Applied Changes', () => {
    test('ASSIGN action records STATE_CHANGED and ASSIGNEE_CHANGED', () => {
      const caseItem = createCase('NEW');
      const result = applyCaseAction(caseItem, { type: 'ASSIGN', assigneeId: 'user-123' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.applied).toHaveLength(2);
        const codes = result.applied.map(c => c.code);
        expect(codes).toContain('STATE_CHANGED');
        expect(codes).toContain('ASSIGNEE_CHANGED');
      }
    });

    test('RESOLVE action records STATE_CHANGED and NOTE_ADDED', () => {
      const caseItem = createCase('IN_PROGRESS');
      const result = applyCaseAction(caseItem, { type: 'RESOLVE', resolutionNote: 'Done' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.applied).toHaveLength(2);
        const codes = result.applied.map(c => c.code);
        expect(codes).toContain('STATE_CHANGED');
        expect(codes).toContain('NOTE_ADDED');
      }
    });

    test('REOPEN action records STATE_CHANGED and NOTE_ADDED', () => {
      const caseItem = createCase('RESOLVED');
      const result = applyCaseAction(caseItem, { type: 'REOPEN', reason: 'Reopened' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.applied).toHaveLength(2);
        const codes = result.applied.map(c => c.code);
        expect(codes).toContain('STATE_CHANGED');
        expect(codes).toContain('NOTE_ADDED');
      }
    });

    test('START_WORK action records only STATE_CHANGED', () => {
      const caseItem = createCase('ASSIGNED');
      const result = applyCaseAction(caseItem, { type: 'START_WORK' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.applied).toHaveLength(1);
        expect(result.applied[0].code).toBe('STATE_CHANGED');
      }
    });
  });

  describe('Result Structure', () => {
    test('success result has ok:true, updated Case, and applied array', () => {
      const caseItem = createCase('NEW');
      const result = applyCaseAction(caseItem, { type: 'ASSIGN', assigneeId: 'user-123' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result).toHaveProperty('updated');
        expect(result).toHaveProperty('applied');
        expect(Array.isArray(result.applied)).toBe(true);
        expect(result.updated).toHaveProperty('id');
        expect(result.updated).toHaveProperty('state');
      }
    });

    test('failure result has ok:false and reasons array', () => {
      const caseItem = createCase('NEW');
      const result = applyCaseAction(caseItem, { type: 'CLOSE' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result).toHaveProperty('reasons');
        expect(Array.isArray(result.reasons)).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(0);
        expect(result.reasons[0]).toHaveProperty('code');
        expect(result.reasons[0]).toHaveProperty('message');
      }
    });
  });
});
