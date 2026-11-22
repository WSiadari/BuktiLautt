import { existsSync, linkSync, unlinkSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { AccountStore } from "../server/accounts/store.ts";
import { demoDraft } from "../src/data/demo.ts";

const target = process.argv[2];
if (!target || !isAbsolute(target) || !target.endsWith(".sintetis.sqlite")) {
  throw new Error("Tentukan path absolut untuk database baru dengan akhiran .sintetis.sqlite");
}
if (existsSync(target)) {
  console.log("Tujuan sudah ada. Berkas dilewati tanpa dibuka.");
} else {
  const store = new AccountStore(":memory:");
  const temp = target + "." + randomUUID();
  try {
    const session = await store.register("demo@buktilaut.test", "Demo-Sintetis-48!", "Demo sintetis");
    const identity = store.authenticate(session);
    const draft = demoDraft();
    draft.demo = false;
    draft.id = "BL-SINTETIS-01";
    draft.weighingConfirmed = draft.receiptConfirmed = true;
    draft.receipt[0].kg = "10";
    draft.pairs = draft.weighing.map((w,i)=>({weighId:w.id, receiptId:draft.receipt[i].id, decision:"confirmed", adjustment:"", explanation:""}));
    const entry=store.saveArchive(identity,{transactionId:"contoh-sintetis-01",baseRevision:0,status:"confirmed",transactionDate:"2026-11-06",transactionDateConfirmed:true,counterpartyName:"Mitra sintetis",draft},[]);
    store.db.prepare("VACUUM INTO ?").run(temp);
    // Publish only a complete file. A concurrent seed can never overwrite the winner.
    linkSync(temp,target);
    console.log("Arsip contoh dibuat · " + entry.reference + " · Teri 12 kg timbang / 10 kg nota.");
  } finally {
    store.close();
    if(existsSync(temp)) unlinkSync(temp);
  }
}
