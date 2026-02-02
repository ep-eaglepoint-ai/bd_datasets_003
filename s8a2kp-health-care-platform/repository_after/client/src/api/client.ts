
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/graphql', // Simple GraphQL endpoint proxy or direct
  headers: {
    'Content-Type': 'application/json',
  },
});

export const gqlRequest = async (query: string, variables?: any) => {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  
  try {
    const response = await api.post('', { query, variables }, { headers });
    if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
    }
    return response.data.data;
  } catch (error: any) {
    console.error('API Error:', error);
    throw error;
  }
};
