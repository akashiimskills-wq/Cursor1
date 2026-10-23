export class ApiError extends Error {
  status: number;
  distanceM: number | null;

  constructor(status: number, message: string, distanceM: number | null = null) {
    super(message);
    this.status = status;
    this.distanceM = distanceM;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (response.headers.get("content-type")?.includes("text/csv")) {
    return (await response.text()) as T;
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, data?.error || "Something went wrong.", data?.distanceM ?? null);
  return data as T;
}
