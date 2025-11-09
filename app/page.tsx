"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Area,
  AreaChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Entry = {
  id: string;
  value: number;
  date: string;
  period: "Fasting" | "Pre-Meal" | "Post-Meal";
  note?: string;
};

const initialEntries: Entry[] = [
  {
    id: "1",
    value: 5.7,
    date: "2024-05-17T07:45",
    period: "Fasting",
  },
  {
    id: "2",
    value: 7.7,
    date: "2024-05-16T12:15",
    period: "Post-Meal",
  },
  {
    id: "3",
    value: 6.6,
    date: "2024-05-15T18:05",
    period: "Pre-Meal",
  },
  {
    id: "4",
    value: 5.3,
    date: "2024-05-15T07:20",
    period: "Fasting",
    note: "Light walk + half portion breakfast",
  },
];

const periodTheme: Record<Entry["period"], string> = {
  Fasting: "bg-sky-50 text-sky-800 border border-sky-100",
  "Pre-Meal": "bg-emerald-50 text-emerald-800 border border-emerald-100",
  "Post-Meal": "bg-amber-50 text-amber-800 border border-amber-100",
};

type FormState = {
  value: string;
  date: string;
  time: string;
  period: Entry["period"];
  includeNote: boolean;
  note: string;
};

type SupabaseRow = {
  id: string;
  value: number;
  reading_date: string;
  period: Entry["period"] | string;
  note: string | null;
};

const allowedPeriods: Entry["period"][] = ["Fasting", "Pre-Meal", "Post-Meal"];

const mapRowToEntry = (row: SupabaseRow): Entry => ({
  id: row.id,
  value: row.value,
  date: row.reading_date,
  period: allowedPeriods.includes(row.period as Entry["period"])
    ? (row.period as Entry["period"])
    : "Fasting",
  note: row.note ?? undefined,
});

const sortEntriesByDateDesc = (list: Entry[]) =>
  [...list].sort((a, b) => (a.date < b.date ? 1 : -1));

const toInputDate = (isoString: string) => {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toInputTime = (isoString: string) => {
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Unknown error";
};

const formatValue = (value?: number) =>
  typeof value === "number" ? `${(Math.round(value * 10) / 10).toFixed(1)} mmol/L` : "--";

const PAGE_SIZE = 10;

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [form, setForm] = useState<FormState>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    return {
      value: "",
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
      period: "Fasting",
      includeNote: false,
      note: "",
    };
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    register();
  }, []);

  const resetForm = (nextPeriod?: Entry["period"]) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    setForm((prev) => ({
      value: "",
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
      period: nextPeriod ?? prev.period,
      includeNote: false,
      note: "",
    }));
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoadingEntries(false);
      setSyncError("Supabase is not configured. Add your credentials to enable syncing.");
      return;
    }

    let isActive = true;

    const fetchEntries = async () => {
      if (!supabase) {
        return;
      }
      setIsLoadingEntries(true);
      try {
        const { data, error } = await supabase
          .from("glucose_entries")
          .select("id,value,reading_date,period,note")
          .order("reading_date", { ascending: false });

        if (error) throw error;

        if (isActive && data) {
          setEntries(data.map(mapRowToEntry));
          setSyncError(null);
        }
      } catch (error) {
        console.error("Unable to load Supabase data", error);
        if (isActive) {
          setSyncError("Live sync unavailable. Showing the last cached sample.");
        }
      } finally {
        if (isActive) {
          setIsLoadingEntries(false);
        }
      }
    };

    fetchEntries();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(entries.length / PAGE_SIZE) || 1);
    setCurrentPage((prev) => Math.min(prev, maxPage));
  }, [entries.length]);

  const averages = useMemo(() => {
    if (!entries.length) {
      return { average: 0, recent: 0, trend: 0 };
    }

    const values = entries.map((entry) => entry.value);
    const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
    const recentEntries = entries.slice(0, Math.min(3, entries.length));
    const recentAvg =
      recentEntries.reduce((acc, entry) => acc + entry.value, 0) / (recentEntries.length || 1);

    return {
      average: Math.round(avg * 10) / 10,
      recent: Math.round(recentAvg * 10) / 10,
      trend: Math.round((recentAvg - avg) * 10) / 10,
    };
  }, [entries]);

  const lastEntry = entries[0];

  const chartData = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const recent = sorted.slice(-8);
    return recent.map((entry) => ({
      value: entry.value,
      label: new Intl.DateTimeFormat("en", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(entry.date)),
      period: entry.period,
    }));
  }, [entries]);

  const renderTrendLabel = ({
    x,
    y,
    value,
  }: {
    x?: number;
    y?: number;
    value?: string;
  }) => {
    if (typeof x !== "number" || typeof y !== "number" || !value) {
      return null;
    }

    return (
      <text
        x={x}
        y={y - 10}
        textAnchor="middle"
        fontSize={10}
        fill="#0f172a"
        fontWeight={600}
      >
        {value}
      </text>
    );
  };

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE) || 1);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, currentPage]);
  const startIndex = entries.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = entries.length ? Math.min(entries.length, currentPage * PAGE_SIZE) : 0;

  const startEditing = (entry: Entry) => {
    setEditingId(entry.id);
    setForm({
      value: entry.value.toString(),
      date: toInputDate(entry.date),
      time: toInputTime(entry.date),
      period: entry.period,
      includeNote: Boolean(entry.note),
      note: entry.note ?? "",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleExportCsv = () => {
    if (!entries.length || typeof window === "undefined") {
      if (typeof window !== "undefined" && !entries.length) {
        window.alert("No readings to export yet.");
      }
      return;
    }

    setIsExporting(true);
    try {
      const toMeridiemTime = (date: Date) => {
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const suffix = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        const formattedHours = String(hours).padStart(2, "0");
        return `${formattedHours}:${minutes} ${suffix}`;
      };

      const header = ["Reading Date", "Reading Time", "Period", "Value (mmol/L)", "Note"];
      const rows = sortEntriesByDateDesc(entries).map((entry) => {
        const date = new Date(entry.date);
        return [
          date.toISOString().split("T")[0],
          toMeridiemTime(date),
          entry.period,
          entry.value.toFixed(1),
          entry.note ?? "",
        ];
      });

      const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [header, ...rows]
        .map((row) => row.map((cell) => escapeCell(String(cell ?? ""))).join(","))
        .join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `glucose-readings-${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export CSV", error);
      window.alert("Something went wrong while creating the CSV. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    resetForm();
  };

  const handleDelete = async (entry: Entry) => {
    const confirmed = typeof window === "undefined" ? true : window.confirm("Delete this reading?");
    if (!confirmed) return;

    setDeletingId(entry.id);
    setStatusMessage(null);
    try {
      if (supabase) {
        const { error } = await supabase.from("glucose_entries").delete().eq("id", entry.id);
        if (error) throw error;
      }
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      if (editingId === entry.id) {
        cancelEditing();
      }
      setStatusMessage("Reading deleted.");
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Unable to delete entry", message, error);
      setStatusMessage(
        (supabase ? "Could not delete from Supabase. Please retry." : "Supabase not configured. Remove locally only.") +
          (message ? ` (${message})` : ""),
      );
    } finally {
      setDeletingId(null);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.value || !form.date || !form.time) return;

    const localDate = new Date(`${form.date}T${form.time}`);
    const composedDate = localDate.toISOString();
    const note = form.includeNote && form.note.trim().length > 0 ? form.note.trim() : undefined;
    const entryId =
      editingId ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Date.now()));
    const draftEntry: Entry = {
      id: entryId,
      value: Number(form.value),
      date: composedDate,
      period: form.period,
      note,
    };

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      if (!supabase) {
        throw new Error("Supabase credentials missing");
      }

      const payload = {
        id: draftEntry.id,
        value: draftEntry.value,
        reading_date: draftEntry.date,
        period: draftEntry.period,
        note: draftEntry.note ?? null,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("glucose_entries")
          .update(payload)
          .eq("id", editingId)
          .select("id,value,reading_date,period,note")
          .single();

        if (error) throw error;

        const updatedEntry = data ? mapRowToEntry(data as SupabaseRow) : draftEntry;
        setEntries((prev) =>
          sortEntriesByDateDesc(prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))),
        );
        resetForm(updatedEntry.period);
        setEditingId(null);
        setStatusMessage("Reading updated.");
      } else {
        const { data, error } = await supabase
          .from("glucose_entries")
          .insert(payload)
          .select("id,value,reading_date,period,note")
          .single();

        if (error) throw error;

        const savedEntry = data ? mapRowToEntry(data as SupabaseRow) : draftEntry;
        setEntries((prev) => sortEntriesByDateDesc([savedEntry, ...prev]));
        resetForm(savedEntry.period);
        setStatusMessage("Reading saved to Supabase.");
      }

      setSyncError(null);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Unable to save entry", message, error);
      const baseStatus = supabase
        ? editingId
          ? "Could not update on Supabase. Please retry."
          : "Could not save to Supabase. Please retry."
        : "Supabase not configured. Entry kept locally for now.";
      setStatusMessage(baseStatus + (message ? ` (${message})` : ""));
      setEntries((prev) => {
        const nextEntries = editingId
          ? prev.map((entry) => (entry.id === draftEntry.id ? draftEntry : entry))
          : [draftEntry, ...prev];
        return sortEntriesByDateDesc(nextEntries);
      });
      if (!supabase) {
        if (editingId) {
          setEditingId(null);
        }
        resetForm(draftEntry.period);
      }
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-8 text-zinc-900 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
        {syncError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {syncError}
          </div>
        )}
        <section className="rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/70">Sugar Glucose Tracker</p>
              <h1 className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">
                Capture readings anywhere with a calm mobile hub.
              </h1>
              <p className="mt-3 text-sm text-white/80">
                Glance at your last numbers, then jump straight into logging.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.4em] text-white/70">Last Reading</p>
                <p className="mt-2 text-3xl font-semibold">{formatValue(lastEntry?.value)}</p>
                <p className="text-sm text-white/80">
                  {lastEntry ? formatter.format(new Date(lastEntry.date)) : "No data yet"}
                </p>
                <p className="mt-3 text-xs text-emerald-200">Target range 4.4 - 7.8 mmol/L</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.4em] text-white/70">Weekly Avg</p>
                <p className="mt-2 text-3xl font-semibold">{formatValue(averages.recent)}</p>
                <p className="text-sm text-white/80">Δ {averages.trend > 0 ? "+" : ""}{averages.trend.toFixed(1)} mmol/L vs overall</p>
                <p className="mt-3 text-xs text-white/70">Stay within 0.6 mmol/L for steady days</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="#quick-log"
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 sm:flex-none sm:px-6"
              >
                Log a reading
              </a>
              <button className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/50 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:flex-none sm:px-6">
                Share summary
              </button>
            </div>
          </div>
        </section>

        <section id="quick-log" className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-black/5 sm:p-6">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                {editingId ? "Editing" : "Quick Log"}
              </p>
              <h2 className="text-2xl font-semibold text-slate-900">
                {editingId ? "Update reading" : "Record a new reading"}
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Auto timestamp ready</span>
          </header>
          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col text-sm font-medium text-slate-700">
                Glucose (mmol/L)
                <input
                  type="number"
                  min="2"
                  max="25"
                  step="0.1"
                  inputMode="decimal"
                  value={form.value}
                  onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
                  className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20"
                  required
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-700">
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20"
                  required
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-slate-700">
                Time
                <input
                  type="time"
                  value={form.time}
                  onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
                  className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20"
                  required
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Fasting", "Pre-Meal", "Post-Meal"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, period: label as Entry["period"] }))}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    form.period === label
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-900/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.includeNote}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, includeNote: event.target.checked, note: event.target.checked ? prev.note : "" }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/30"
                />
                Add remarks or notes
              </label>
              {form.includeNote && (
                <textarea
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Meal, medication, mood, activity..."
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/20"
                />
              )}
            </div>
            <div className="space-y-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSubmitting ? (editingId ? "Updating…" : "Saving…") : editingId ? "Update reading" : "Save reading"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
                >
                  Cancel editing
                </button>
              )}
              {statusMessage && <p className="text-sm text-slate-500">{statusMessage}</p>}
            </div>
          </form>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-black/5 sm:p-6">
            <header className="flex items-center justify-between text-sm">
              <div>
                <p className="uppercase tracking-[0.3em] text-slate-400">Trend</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Past 7 days</h2>
              </div>
              <span className={`text-sm font-semibold ${averages.trend <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {averages.trend > 0 ? "+" : ""}
                {averages.trend.toFixed(1)} mmol/L
              </span>
            </header>
            <div className="mt-6">
              {chartData.length ? (
                <div className="relative h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#475569" }}
                        stroke="#cbd5f5"
                        tickLine={false}
                        axisLine={false}
                        interval="equidistantPreserveStart"
                        minTickGap={30}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        stroke="#e2e8f0"
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 10px 40px rgba(15,23,42,0.1)",
                          background: "white",
                          fontSize: 12,
                          color: "#0f172a",
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)} mmol/L`, "Reading"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#0f172a"
                        strokeWidth={3}
                        fill="url(#trendGradient)"
                        dot={{ r: 3, strokeWidth: 1, stroke: "#0f172a", fill: "#fff" }}
                        activeDot={{ r: 4 }}
                      >
                        <LabelList dataKey="period" content={renderTrendLabel} />
                      </Area>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No readings yet. Add entries to unlock the trend view.
                </p>
              )}
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Values sweeping up? Try logging meals, stress, or sleep changes so you can act faster.
            </p>
          </div>

          <div className="rounded-[28px] bg-slate-900 p-5 text-white shadow-lg ring-1 ring-black/5 sm:p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Averages</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Overall</p>
                <p className="mt-2 text-3xl font-semibold">{formatValue(averages.average)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Recent</p>
                <p className="mt-2 text-3xl font-semibold">{formatValue(averages.recent)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              Keep recent numbers within 0.6 mmol/L of overall average to maintain steady control.
            </p>
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-black/5 sm:p-6">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">History</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Recent entries</h2>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!entries.length || isExporting}
              className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {isExporting ? "Preparing…" : "Export CSV"}
            </button>
          </header>
          <div className="mt-6 divide-y divide-slate-100">
            {isLoadingEntries ? (
              <p className="py-4 text-sm text-slate-500">Loading latest readings…</p>
            ) : entries.length ? (
              paginatedEntries.map((entry) => (
                <article key={entry.id} className="grid gap-4 py-4 sm:grid-cols-[1.2fr,1fr,auto] sm:items-center">
                  <div>
                    <p className="text-sm text-slate-500">{formatter.format(new Date(entry.date))}</p>
                    <p className="text-2xl font-semibold text-slate-900">{formatValue(entry.value)}</p>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:gap-4">
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${periodTheme[entry.period]}`}>
                      {entry.period}
                    </div>
                    {entry.note ? (
                      <p className="text-left text-slate-600 sm:text-right">{entry.note}</p>
                    ) : (
                      <span>📝 Add note</span>
                    )}
                  </div>
                  <div className="flex items-center justify-self-end gap-3">
                    <button
                      type="button"
                      className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
                      onClick={() => startEditing(entry)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm font-semibold text-rose-500 underline-offset-4 hover:text-rose-600 hover:underline disabled:opacity-60"
                      onClick={() => handleDelete(entry)}
                      disabled={deletingId === entry.id || isSubmitting}
                    >
                      {deletingId === entry.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="py-4 text-sm text-slate-500">No readings yet. Log your first entry above.</p>
            )}
          </div>
          {!isLoadingEntries && entries.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {startIndex}-{endIndex} of {entries.length} readings
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || !entries.length}
                  className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
