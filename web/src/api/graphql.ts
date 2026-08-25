const API_URL = import.meta.env.VITE_API_URL ?? "/graphql";

/**
 * Minimal GraphQL client — no library needed for this scope.
 * Reads the JWT token from localStorage for authenticated requests.
 */
export async function gqlRequest<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    const err = json.errors[0];
    const error = new Error(err.message) as Error & {
      code?: string;
    };
    error.code = err.extensions?.code;
    throw error;
  }

  return json.data as T;
}
