const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export const apiCall = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fullUrl = `${API_BASE_URL}${endpoint}`;
  console.log("🌐 API Call:", { endpoint, fullUrl, apiBaseUrl: API_BASE_URL });

  return fetch(fullUrl, {
    ...options,
    headers,
  });
};

export const handleApiError = async (response: Response): Promise<never> => {
  try {
    const errorData = await response.json();
    throw new Error(
      errorData.error || `HTTP ${response.status}: ${response.statusText}`
    );
  } catch {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
};
