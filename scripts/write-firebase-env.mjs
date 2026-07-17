import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const appId = "1:895117799817:web:8821ee17cfe87a4f817158";
const output = execFileSync(
  "npx",
  ["firebase-tools", "apps:sdkconfig", "WEB", appId, "--json"],
  { encoding: "utf8" },
);
const response = JSON.parse(output);
const apiKey = response?.result?.sdkConfig?.apiKey;

if (!apiKey) {
  throw new Error("Firebase 웹 앱 API 키를 가져오지 못했습니다.");
}

writeFileSync(".env.local", `VITE_FIREBASE_API_KEY=${apiKey}\n`, { mode: 0o600 });
console.log("Firebase 설정을 .env.local에 저장했습니다.");
