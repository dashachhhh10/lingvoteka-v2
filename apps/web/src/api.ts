export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...options });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Не удалось связаться с сервером. Проверь соединение и попробуй снова.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? (payload as { message: unknown }).message
        : null;
    throw new Error(
      typeof message === 'string' ? message : 'Не удалось выполнить действие. Попробуй ещё раз.',
    );
  }
  return payload as T;
}
