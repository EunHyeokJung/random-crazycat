import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const appId = "1:895117799817:web:8821ee17cfe87a4f817158";
let apiKey = process.env.VITE_FIREBASE_API_KEY?.trim();

if (!apiKey) {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error("이 스크립트는 npm run firebase:config로 실행해야 합니다.");
  }

  const npxCliPath = join(dirname(npmExecPath), "npx-cli.js");
  const output = execFileSync(
    process.execPath,
    [npxCliPath, "firebase-tools", "apps:sdkconfig", "WEB", appId, "--json"],
    { encoding: "utf8" },
  );
  const response = JSON.parse(output);
  apiKey = response?.result?.sdkConfig?.apiKey;
}

if (!apiKey) {
  throw new Error("Firebase 웹 앱 API 키를 가져오지 못했습니다.");
}

writeFileSync(".env.local", `VITE_FIREBASE_API_KEY=${apiKey}\n`, { mode: 0o600 });
console.log("Firebase 설정을 .env.local에 저장했습니다.");
