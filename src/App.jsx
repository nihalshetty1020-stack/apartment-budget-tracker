import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { addDoc, collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKl5TBd-XIiPnvuBxd56cG9sg_0lxeeIU",
  authDomain: "apartment-budget-tracker.firebaseapp.com",
  projectId: "apartment-budget-tracker",
  storageBucket: "apartment-budget-tracker.firebasestorage.app",
  messagingSenderId: "389694587209",
  appId: "1:389694587209:web:99f521975999a66f1c9a98",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const people = ["Nihal", "Shreya"];
const categories = ["Rent", "Grocery", "Hydro", "Wi-Fi", "Laundry", "Rental Insurance", "Household", "Transportation", "Savings", "Other"];
const NEW_LINE = String.fromCharCode(10);
const STORAGE_KEY = "budget-tracker-data-v1";
const TEST_STORAGE_KEY = "budget-tracker-test-key";
const SETTINGS_DOC = "shared-settings";

function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function money(value) { return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value || 0)); }
function makeId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function autoCategory(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("rent")) return "Rent";
  if (value.includes("costco") || value.includes("grocery") || value.includes("walmart") || value.includes("freshco")) return "Grocery";
  if (value.includes("hydro") || value.includes("electric")) return "Hydro";
  if (value.includes("rogers") || value.includes("bell") || value.includes("internet") || value.includes("wifi")) return "Wi-Fi";
  if (value.includes("laundry")) return "Laundry";
  if (value.includes("insurance")) return "Rental Insurance";
  if (value.includes("uber") || value.includes("ttc") || value.includes("presto")) return "Transportation";
  if (value.includes("saving")) return "Savings";
  return "Other";
}

function calculate(expenses) {
  const paid = { Nihal: 0, Shreya: 0 };
  const share = { Nihal: 0, Shreya: 0 };
  let total = 0;
  let savings = 0;

  expenses.forEach((item) => {
    const amount = Number(item.amount || 0);
    const payer = people.includes(item.paidBy) ? item.paidBy : "Nihal";
    total += amount;
    if (item.category === "Savings") savings += amount;
    paid[payer] += amount;
    if (item.split === "Personal") share[payer] += amount;
    else { share.Nihal += amount / 2; share.Shreya += amount / 2; }
  });

  return { total, savings, paid, share, balance: { Nihal: paid.Nihal - share.Nihal, Shreya: paid.Shreya - share.Shreya } };
}

function createCsv(expenses) {
  const rows = [["Date", "Month", "Category", "Description", "Amount", "Paid By", "Split", "Receipt"]];
  expenses.forEach((item) => rows.push([item.date, item.month, item.category, item.description, item.amount, item.paidBy, item.split, item.receipt || ""]));
  return rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join(NEW_LINE);
}


function loadSavedData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors so the app still works.
  }
}

function testStorage() {
  try {
    localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify({ test: true }));
    const saved = JSON.parse(localStorage.getItem(TEST_STORAGE_KEY));
    localStorage.removeItem(TEST_STORAGE_KEY);
    return saved?.test === true;
  } catch {
    return false;
  }
}

function runTests() {
  const sample = [{ amount: 100, paidBy: "Nihal", split: "50/50", category: "Grocery" }, { amount: 50, paidBy: "Shreya", split: "50/50", category: "Savings" }];
  const result = calculate(sample);
  console.assert(result.total === 150, "total should be 150");
  console.assert(result.savings === 50, "savings should be 50");
  console.assert(result.balance.Nihal === 25, "Nihal should be ahead by 25");
  console.assert(result.balance.Shreya === -25, "Shreya should owe 25");
  console.assert(autoCategory("Rogers internet") === "Wi-Fi", "Rogers should be Wi-Fi");
  console.assert(autoCategory("Costco groceries") === "Grocery", "Costco should be Grocery");
  console.assert(autoCategory("random item") === "Other", "unknown item should be Other");
  console.assert(createCsv(sample).includes(NEW_LINE), "CSV should include new lines");
  console.assert(testStorage(), "local storage should save and load test data");
  console.assert(today().length === 10, "today helper should return yyyy-mm-dd");
  console.assert(typeof STORAGE_KEY === "string", "storage key should exist");
  console.assert(typeof SETTINGS_DOC === "string", "settings doc should exist");
}
if (typeof window !== "undefined") runTests();

export default function ApartmentExpenseTracker() {
  const savedData = typeof window !== "undefined" ? loadSavedData() : null;
  const [expenses, setExpenses] = useState(savedData?.expenses || []);
  const [syncStatus, setSyncStatus] = useState("Connecting to cloud...");
  const [month, setMonth] = useState(savedData?.month || currentMonth());
  const [budget, setBudget] = useState(savedData?.budget || 3200);
  const [savingsGoal, setSavingsGoal] = useState(savedData?.savingsGoal || 500);
  const [dark, setDark] = useState(savedData?.dark || false);
  const [activeUser, setActiveUser] = useState(savedData?.activeUser || "Nihal");
  const [editingId, setEditingId] = useState(null);
  const [recurring, setRecurring] = useState(savedData?.recurring || [
    { id: makeId(), name: "Rent", amount: 0, category: "Rent", paidBy: "Nihal", dueDay: 1 },
    { id: makeId(), name: "Wi-Fi", amount: 0, category: "Wi-Fi", paidBy: "Shreya", dueDay: 5 },
    { id: makeId(), name: "Hydro", amount: 0, category: "Hydro", paidBy: "Shreya", dueDay: 15 },
    { id: makeId(), name: "Insurance", amount: 0, category: "Rental Insurance", paidBy: "Nihal", dueDay: 10 },
  ]);
  const [form, setForm] = useState({ date: today(), category: "Grocery", description: "", amount: "", paidBy: savedData?.activeUser || "Nihal", split: "50/50", receipt: "" });

  const monthExpenses = useMemo(() => expenses.filter((item) => item.month === month), [expenses, month]);
  const totals = useMemo(() => calculate(monthExpenses), [monthExpenses]);
  const categoryTotals = useMemo(() => categories.map((category) => ({ category, total: monthExpenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount || 0), 0) })).filter((x) => x.total > 0), [monthExpenses]);
  const budgetUsed = budget > 0 ? Math.min((totals.total / budget) * 100, 100) : 0;
  const savingsUsed = savingsGoal > 0 ? Math.min((totals.savings / savingsGoal) * 100, 100) : 0;
  const settlement = Math.abs(totals.balance.Nihal) < 0.01 ? "All settled" : totals.balance.Nihal > 0 ? `Shreya owes Nihal ${money(Math.abs(totals.balance.Shreya))}` : `Nihal owes Shreya ${money(Math.abs(totals.balance.Nihal))}`;

  useEffect(() => {
    saveData({ expenses, month, budget, savingsGoal, dark, activeUser, recurring });
  }, [expenses, month, budget, savingsGoal, dark, activeUser, recurring]);

  useEffect(() => {
    const expensesQuery = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const cloudExpenses = snapshot.docs.map((expenseDoc) => ({ id: expenseDoc.id, ...expenseDoc.data() }));
      setExpenses(cloudExpenses);
      setSyncStatus("Cloud sync active");
    }, (error) => {
      console.error("Firestore expense sync error:", error);
      setSyncStatus("Cloud sync issue - using this device only");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const settingsRef = doc(db, "settings", SETTINGS_DOC);
    getDoc(settingsRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (typeof data.budget === "number") setBudget(data.budget);
        if (typeof data.savingsGoal === "number") setSavingsGoal(data.savingsGoal);
        if (Array.isArray(data.recurring)) setRecurring(data.recurring);
      } else {
        setDoc(settingsRef, { budget, savingsGoal, recurring, updatedAt: serverTimestamp() });
      }
    }).catch((error) => console.error("Firestore settings load error:", error));
  }, []);

  async function saveSharedSettings(nextSettings) {
    const settingsRef = doc(db, "settings", SETTINGS_DOC);
    await setDoc(settingsRef, { ...nextSettings, updatedAt: serverTimestamp() }, { merge: true });
  }
  

  function resetForm() {
    setEditingId(null);
    setForm({ date: today(), category: "Grocery", description: "", amount: "", paidBy: activeUser, split: "50/50", receipt: "" });
  }

  async function saveExpense(event) {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    const saved = { ...form, amount: Number(form.amount), month: form.date.slice(0, 7), updatedAt: serverTimestamp() };
    try {
      if (editingId) await updateDoc(doc(db, "expenses", editingId), saved);
      else await addDoc(collection(db, "expenses"), { ...saved, createdAt: serverTimestamp() });
      setMonth(saved.month);
      resetForm();
    } catch (error) {
      console.error("Firestore save expense error:", error);
      alert("Could not save this expense to the cloud. Please try again.");
    }
  }

  function editExpense(item) {
    setEditingId(item.id);
    setForm({ date: item.date, category: item.category, description: item.description, amount: item.amount, paidBy: item.paidBy, split: item.split, receipt: item.receipt || "" });
  }

  async function deleteExpense(id) {
    try {
      await deleteDoc(doc(db, "expenses", id));
    } catch (error) {
      console.error("Firestore delete expense error:", error);
      alert("Could not delete this expense from the cloud. Please try again.");
    }
  }

  function updateDescription(value) {
    const guessed = autoCategory(value);
    setForm((current) => ({ ...current, description: value, category: guessed === "Other" ? current.category : guessed }));
  }

  function exportCsv() {
    const blob = new Blob([createCsv(expenses)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `411-duplex-expenses-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function addRecurringBills() {
    const newItems = recurring.filter((bill) => Number(bill.amount) > 0).map((bill) => ({
      date: `${month}-01`, month, category: bill.category, description: `${bill.name} - recurring`, amount: Number(bill.amount), paidBy: bill.paidBy, split: "50/50", receipt: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    try {
      await Promise.all(newItems.map((item) => addDoc(collection(db, "expenses"), item)));
    } catch (error) {
      console.error("Firestore recurring bill error:", error);
      alert("Could not add recurring bills to the cloud. Please try again.");
    }
  }

  function updateRecurring(id, field, value) {
    setRecurring((list) => {
      const updated = list.map((bill) => (bill.id === id ? { ...bill, [field]: value } : bill));
      saveSharedSettings({ budget, savingsGoal, recurring: updated }).catch((error) => console.error("Firestore recurring setting error:", error));
      return updated;
    });
  }

  function updateBudget(value) {
    const nextBudget = Number(value);
    setBudget(nextBudget);
    saveSharedSettings({ budget: nextBudget, savingsGoal, recurring }).catch((error) => console.error("Firestore budget setting error:", error));
  }

  function updateSavingsGoal(value) {
    const nextGoal = Number(value);
    setSavingsGoal(nextGoal);
    saveSharedSettings({ budget, savingsGoal: nextGoal, recurring }).catch((error) => console.error("Firestore savings setting error:", error));
  }

  const pageClass = dark ? "min-h-screen bg-slate-950 text-white" : "min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 text-slate-900";
  const cardClass = dark ? "rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6" : "rounded-3xl border border-white/80 bg-white/90 p-5 shadow-sm sm:p-6";
  const inputClass = dark ? "rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none" : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none";
  const dateInputClass = dark ? `${inputClass} date-input-dark` : inputClass;

  return (
    <div className={pageClass}>
      <style>{`
        .date-input-dark {
          color-scheme: dark;
          position: relative;
        }
        .date-input-dark::-webkit-calendar-picker-indicator {
          opacity: 0;
          cursor: pointer;
        }
        .date-field-wrap::after {
          content: "📅";
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          font-size: 1rem;
          opacity: 0.95;
        }
        .date-input-dark::-webkit-datetime-edit,
        .date-input-dark::-webkit-datetime-edit-fields-wrapper,
        .date-input-dark::-webkit-datetime-edit-text,
        .date-input-dark::-webkit-datetime-edit-month-field,
        .date-input-dark::-webkit-datetime-edit-day-field,
        .date-input-dark::-webkit-datetime-edit-year-field {
          color: white;
        }
      `}</style>
      <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-6">
        <header className="mb-5 rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 p-5 text-white shadow-xl sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold sm:text-4xl">Budget Tracker</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">Shared apartment budget with split tracking, recurring bills, savings, receipts, and backups.</p>
              <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90">{syncStatus}</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
              <select value={activeUser} onChange={(e) => { setActiveUser(e.target.value); setForm((f) => ({ ...f, paidBy: e.target.value })); }} className="w-full rounded-2xl border border-white/40 bg-white/10 px-4 py-3 text-base text-white outline-none">
                {people.map((p) => <option key={p} className="text-slate-900">{p}</option>)}
              </select>
              <button onClick={() => setDark(!dark)} className="w-full rounded-2xl border border-white/40 bg-white/10 px-4 py-3 text-base text-white outline-none">{dark ? "Light" : "Dark"}</button>
              <button onClick={exportCsv} className="w-full rounded-2xl bg-white px-4 py-3 text-base font-semibold text-indigo-700">CSV / Sheets Backup</button>
            </div>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}><p className="text-sm opacity-70">Month</p><div className={dark ? "date-field-wrap relative mt-3" : "mt-3"}><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`w-full min-w-0 ${dateInputClass}`} /></div></div>
          <div className="min-w-0 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 p-5 text-white"><p className="text-sm text-white/80">Monthly Total</p><h2 className="mt-3 text-2xl font-bold sm:text-3xl">{money(totals.total)}</h2><p className="text-sm text-white/80">{monthExpenses.length} expenses</p></div>
          <div className="min-w-0 rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 p-5 text-white"><p className="text-sm text-white/80">Budget</p><input type="number" value={budget} onChange={(e) => updateBudget(e.target.value)} className="mt-3 w-full rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-xl font-bold text-white outline-none" /><div className="mt-3 h-2 rounded-full bg-white/25"><div className="h-2 rounded-full bg-white" style={{ width: `${budgetUsed}%` }} /></div></div>
          <div className="min-w-0 rounded-3xl bg-gradient-to-br from-orange-400 to-pink-500 p-5 text-white"><p className="text-sm text-white/80">Split Summary</p><h2 className="mt-3 text-lg font-bold">{settlement}</h2><p className="text-sm text-white/80">50/50 or personal</p></div>
        </section>

        

        <main className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="min-w-0 space-y-5">
            <div className={cardClass}>
              <h2 className="mb-4 text-xl font-bold">{editingId ? "Edit expense" : "Add expense"}</h2>
              <form onSubmit={saveExpense} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2"><div className={dark ? "date-field-wrap relative" : "relative"}><input type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`w-full ${dateInputClass}`} /></div><input type="number" min="0" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} /></div>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`w-full ${inputClass}`}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
                <input placeholder="Description e.g. Rogers internet" value={form.description} onChange={(e) => updateDescription(e.target.value)} className={`w-full ${inputClass}`} />
                <div className="grid gap-3 sm:grid-cols-2"><select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} className={inputClass}>{people.map((p) => <option key={p}>{p}</option>)}</select><select value={form.split} onChange={(e) => setForm({ ...form, split: e.target.value })} className={inputClass}><option>50/50</option><option>Personal</option></select></div>
                <label className={`block cursor-pointer ${inputClass}`}>Receipt upload<input type="file" className="hidden" onChange={(e) => setForm({ ...form, receipt: e.target.files?.[0]?.name || "" })} />{form.receipt && <span className="ml-2 text-sm opacity-70">{form.receipt}</span>}</label>
                <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 px-4 py-4 text-base font-semibold text-white shadow-sm">{editingId ? "Update Expense" : "Add Expense"}</button>
                {editingId && <button type="button" onClick={resetForm} className="w-full rounded-2xl border px-4 py-3">Cancel</button>}
              </form>
            </div>

            <div className={cardClass}>
              <h2 className="mb-3 text-xl font-bold">Recurring monthly bills</h2>
              <p className="mb-3 text-sm opacity-70">Add your regular monthly bills once, then click the button to add them to the selected month.</p>
              <div className="space-y-2">
                {recurring.map((bill) => (
                  <div key={bill.id} className="grid gap-2 sm:grid-cols-2">
                    <input value={bill.name} onChange={(e) => updateRecurring(bill.id, "name", e.target.value)} className={inputClass} />
                    <input type="number" value={bill.amount} onChange={(e) => updateRecurring(bill.id, "amount", e.target.value)} className={inputClass} />
                  </div>
                ))}
              </div>
              <button onClick={addRecurringBills} className="mt-3 w-full rounded-2xl bg-indigo-600 px-4 py-4 text-base font-semibold text-white shadow-sm">Add bills to this month</button>
            </div>
          </section>

          <section className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className={cardClass}><h2 className="text-xl font-bold">Savings tracker</h2><input type="number" value={savingsGoal} onChange={(e) => updateSavingsGoal(e.target.value)} className={`mt-3 w-full ${inputClass}`} /><p className="mt-3 text-2xl font-bold">{money(totals.savings)}</p><div className="mt-3 h-3 rounded-full bg-slate-200"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${savingsUsed}%` }} /></div></div>
              <div className={cardClass}><h2 className="text-xl font-bold">Charts & analytics</h2><div className="mt-3 space-y-2">{categoryTotals.length === 0 ? <p className="text-sm opacity-70">Add expenses to see chart.</p> : categoryTotals.map((item) => <div key={item.category}><div className="flex justify-between text-sm"><span>{item.category}</span><b>{money(item.total)}</b></div><div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${totals.total ? (item.total / totals.total) * 100 : 0}%` }} /></div></div>)}</div></div>
            </div>

            <div className={cardClass}><h2 className="mb-3 text-xl font-bold">Insights</h2><div className="rounded-2xl bg-indigo-50 p-3 text-sm text-slate-700">{totals.total > budget ? `You are ${money(totals.total - budget)} over budget.` : `You are ${money(budget - totals.total)} under budget.`}</div><div className="mt-2 rounded-2xl bg-emerald-50 p-3 text-sm text-slate-700">Auto-category works for Costco, Rogers, Hydro, Uber, Insurance, and similar descriptions.</div></div>

            <div className={cardClass}>
              <h2 className="mb-4 text-xl font-bold">Expenses for {month}</h2>
              <div className="-mx-2 overflow-x-auto rounded-2xl border border-slate-200/70 sm:mx-0"><table className="w-full min-w-[720px] text-left text-sm"><thead className={dark ? "bg-slate-800" : "bg-slate-100"}><tr><th className="whitespace-nowrap p-3">Date</th><th className="whitespace-nowrap p-3">Category</th><th className="whitespace-nowrap p-3">Description</th><th className="whitespace-nowrap p-3">Paid By</th><th className="whitespace-nowrap p-3">Receipt</th><th className="whitespace-nowrap p-3 text-right">Amount</th><th className="whitespace-nowrap p-3 text-right">Actions</th></tr></thead><tbody>{monthExpenses.length === 0 ? <tr><td colSpan={7} className="p-5 text-center opacity-70">No expenses yet.</td></tr> : monthExpenses.map((item) => <tr key={item.id} className="border-t border-slate-200/70"><td className="whitespace-nowrap p-3">{item.date}</td><td className="whitespace-nowrap p-3">{item.category}</td><td className="max-w-[180px] truncate p-3 opacity-80">{item.description || "-"}</td><td className="max-w-[180px] truncate p-3 opacity-80">{item.paidBy}</td><td className="max-w-[180px] truncate p-3 opacity-80">{item.receipt || "-"}</td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(item.amount)}</td><td className="whitespace-nowrap p-3 text-right"><button onClick={() => editExpense(item)} className="mr-2 rounded-xl px-3 py-2 hover:bg-indigo-100">Edit</button><button onClick={() => deleteExpense(item.id)} className="rounded-xl px-3 py-2 text-rose-600 hover:bg-rose-100">Delete</button></td></tr>)}</tbody></table></div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{people.map((person) => <div key={person} className={cardClass}><h3 className="text-lg font-bold">{person}</h3><div className="mt-3 space-y-2 text-sm opacity-80"><div className="flex justify-between"><span>Paid</span><b>{money(totals.paid[person])}</b></div><div className="flex justify-between"><span>Fair share</span><b>{money(totals.share[person])}</b></div><div className="flex justify-between border-t pt-2"><span>Balance</span><b>{money(totals.balance[person])}</b></div></div></div>)}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
