export const context: any = {
    currentUser: { id: 1, email: 'provider@test.com', role: 'PROVIDER' },
    pubSub: {
        publish: () => { },
        subscribe: () => { },
    }
};

export const createValidatorDirective = (schema: any, validate: any) => {
    return { schema, validate };
};

export const gql = (tags: any) => tags[0];

export const AuthenticationError = class extends Error { };
export const ForbiddenError = class extends Error { };

export const createGraphQLHandler = (options: any) => {
    return async () => ({
        statusCode: 200,
        body: JSON.stringify({ data: null }),
    });
};
