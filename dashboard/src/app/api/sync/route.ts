import { NextResponse } from "next/server";

export async function POST() {
  const token    = process.env.GITHUB_TOKEN;
  const owner    = process.env.GITHUB_OWNER;
  const repo     = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_ID ?? "sync.yml";

  if (!token || !owner || !repo) {
    return NextResponse.json({ error: "GitHub 환경변수 미설정" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (res.status === 204) {
    return NextResponse.json({ ok: true });
  }

  const body = await res.text();
  return NextResponse.json({ error: body }, { status: res.status });
}
