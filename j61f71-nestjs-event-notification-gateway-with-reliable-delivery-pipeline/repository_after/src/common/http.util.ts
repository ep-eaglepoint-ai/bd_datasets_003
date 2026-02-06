import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  latencyMs: number;
}

export async function httpPost(
  url: string,
  data: any,
  headers: Record<string, string>,
  timeoutMs: number = 30000,
): Promise<HttpResponse> {
  const start = Date.now();

  const config: AxiosRequestConfig = {
    method: 'POST',
    url,
    data,
    headers,
    timeout: timeoutMs,
    validateStatus: () => true,
  };

  try {
    const response: AxiosResponse = await axios(config);

    return {
      status: response.status,
      headers: response.headers as Record<string, string>,
      body: typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data),
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 0,
      headers: {},
      body: error.message || 'Request failed',
      latencyMs: Date.now() - start,
    };
  }
}
