export type ArchiveAgentAnswer = {
  requestId: string;
  workspaceId: string;
  timezone: "Asia/Jakarta";
  fromDate: string;
  toDate: string;
  totalRupiah: number | null;
  transactionCount: number;
  draftCount: number;
  transactions: {
    transactionId: string;
    revision: number;
    transactionDate: string;
    totalRupiah: number | null;
  }[];
  answer: string;
  provider: { name: "gemini" | "basic"; model: string };
};
export async function askArchiveAgent(
  input: { requestId: string; question: string },
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ArchiveAgentAnswer> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 190000);
  const date = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const amount = (value: unknown) =>
    value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
  try {
    const response = await fetch("/api/archive-agent", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-BuktiLaut-Agent": "1",
        "X-BuktiLaut-Workspace": workspaceId,
      },
      body: JSON.stringify(input),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        value?.error?.message || "Total arsip belum dapat dibaca. Coba lagi.",
      );
    if (
      value.requestId !== input.requestId ||
      value.workspaceId !== workspaceId ||
      value.timezone !== "Asia/Jakarta" ||
      !date(value.fromDate) ||
      !date(value.toDate) ||
      typeof value.answer !== "string" ||
      !amount(value.totalRupiah) ||
      !Number.isInteger(value.transactionCount) ||
      value.transactionCount < 0 ||
      !Number.isInteger(value.draftCount) ||
      value.draftCount < 0 ||
      !Array.isArray(value.transactions) ||
      !value.transactions.every(
        (item: unknown) =>
          !!item &&
          typeof item === "object" &&
          "transactionId" in item &&
          typeof item.transactionId === "string" &&
          "revision" in item &&
          Number.isInteger(item.revision) &&
          Number(item.revision) > 0 &&
          "transactionDate" in item &&
          date(item.transactionDate) &&
          "totalRupiah" in item &&
          amount(item.totalRupiah),
      ) ||
      !["gemini", "basic"].includes(value.provider?.name) ||
      typeof value.provider?.model !== "string"
    )
      throw new Error(
        "Jawaban arsip tidak sesuai ruang kerja atau data yang diminta.",
      );
    return value;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        signal?.aborted
          ? "Permintaan dibatalkan. Riwayat dan arsip tetap utuh."
          : "Waktu tunggu arsip habis. Coba lagi tanpa mengubah transaksi.",
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
