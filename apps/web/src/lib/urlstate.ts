export function applyFilter(search: string, key: string, value: string | null): string {
  const p = new URLSearchParams(search);
  if (value === null || value === "") p.delete(key);
  else p.set(key, value);
  p.delete("page");
  p.delete("sel");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function withPage(search: string, page: number): string {
  const p = new URLSearchParams(search);
  p.set("page", String(page));
  return `?${p.toString()}`;
}
