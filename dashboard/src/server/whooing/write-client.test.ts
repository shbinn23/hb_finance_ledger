import assert from "node:assert/strict";
import test from "node:test";
import { createWhooingAccount, extractWhooingAccountId, updateWhooingEntry } from "./write-client.ts";

const payload = {
  section_id: "s1",
  entry_date: "20260815",
  l_account: "expenses" as const,
  l_account_id: "food",
  r_account: "assets" as const,
  r_account_id: "bank",
  item: "점심",
  money: 9000,
  memo: "",
};

test("Whooing update uses authenticated PUT for one positive entry id", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    appId: process.env.WHOOING_APP_ID,
    token: process.env.WHOOING_TOKEN,
    signature: process.env.WHOOING_SIGNATURE,
  };
  process.env.WHOOING_APP_ID = "test-app";
  process.env.WHOOING_TOKEN = "test-token";
  process.env.WHOOING_SIGNATURE = "test-signature";
  let request: { url: string; method: string; body: string } | null = null;
  globalThis.fetch = async (url, init) => {
    request = {
      url: String(url),
      method: String(init?.method),
      body: String(init?.body),
    };
    return new Response(JSON.stringify({ code: 200, results: { entry_id: 42 } }), { status: 200 });
  };
  try {
    await updateWhooingEntry(42, payload);
    assert.equal(request?.url, "https://whooing.com/api/entries/42.json");
    assert.equal(request?.method, "PUT");
    assert.match(request?.body ?? "", /section_id=s1/);
    assert.match(request?.body ?? "", /money=9000/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.appId === undefined) delete process.env.WHOOING_APP_ID;
    else process.env.WHOOING_APP_ID = originalEnv.appId;
    if (originalEnv.token === undefined) delete process.env.WHOOING_TOKEN;
    else process.env.WHOOING_TOKEN = originalEnv.token;
    if (originalEnv.signature === undefined) delete process.env.WHOOING_SIGNATURE;
    else process.env.WHOOING_SIGNATURE = originalEnv.signature;
  }
});

test("Whooing update rejects invalid entry ids before fetch", async () => {
  await assert.rejects(() => updateWhooingEntry(0, payload), /Invalid Whooing entry id/);
});

test("Whooing account creation posts a full normal account payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = ["WHOOING_APP_ID", "WHOOING_TOKEN", "WHOOING_SIGNATURE"]
    .map((key) => [key, process.env[key]] as const);
  process.env.WHOOING_APP_ID = "test-app";
  process.env.WHOOING_TOKEN = "test-token";
  process.env.WHOOING_SIGNATURE = "test-signature";
  let request: { url: string; body: string } | null = null;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), body: String(init?.body) };
    return new Response(JSON.stringify({ code: 200, results: { account_id: "x99" } }), { status: 200 });
  };
  try {
    const response = await createWhooingAccount("assets", {
      section_id: "s1", title: "신한 9단적금", type: "account",
      open_date: "20260831", close_date: "29991231", memo: "편한가계부 import 승인 생성",
      category: "normal",
    });
    assert.equal(request?.url, "https://whooing.com/api/accounts/assets.json");
    assert.match(request?.body ?? "", /title=%EC%8B%A0%ED%95%9C/);
    assert.equal(extractWhooingAccountId(response), "x99");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("Whooing account id extractor rejects an ambiguous response", () => {
  assert.throws(() => extractWhooingAccountId({ code: 200, results: {} }), /account id/);
});
