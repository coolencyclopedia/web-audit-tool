import "./style.css";

const runBtn = document.getElementById("runAudit");
const urlInput = document.getElementById("urlInput");
const results = document.getElementById("results");

const seoScoreEl = document.getElementById("seoScore");
const securityScoreEl = document.getElementById("securityScore");
const issuesList = document.getElementById("issuesList");

runBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) return alert("Enter a URL");

  results.classList.remove("hidden");
  seoScoreEl.textContent = "...";
  securityScoreEl.textContent = "...";
  issuesList.innerHTML = "<li>Running audit...</li>";

  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    seoScoreEl.textContent = data.scores.seo;
    securityScoreEl.textContent = data.scores.security;

    issuesList.innerHTML = "";
    if (data.issues.length === 0) {
      issuesList.innerHTML = "<li>No issues found 🎉</li>";
    } else {
      data.issues.forEach((issue) => {
        const li = document.createElement("li");
        li.textContent = `[${issue.type}] ${issue.message}`;
        issuesList.appendChild(li);
      });
    }
  } catch {
    issuesList.innerHTML = "<li>Audit failed</li>";
  }
});
