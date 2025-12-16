import "./style.css";

function setRing(el, score) {
  el.style.strokeDasharray = `${score}, 100`;
}

const runBtn = document.getElementById("runAudit");
const urlInput = document.getElementById("urlInput");
const results = document.getElementById("results");

const seoScoreEl = document.getElementById("seoScore");
const securityScoreEl = document.getElementById("securityScore");
const issuesList = document.getElementById("issuesList");

const status = document.getElementById("status");

status.textContent = "Running audit…";

if (data.cached) {
  status.textContent = "⚡ Served from cache";
} else {
  status.textContent = "Fresh audit";
}

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

    setRing(document.getElementById("seoRing"), data.scores.seo);
    setRing(document.getElementById("securityRing"), data.scores.security);

    issuesList.innerHTML = "";

    data.issues.forEach((issue) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${issue.type}</strong>: ${issue.message}`;
      issuesList.appendChild(li);
    });
  } catch {
    issuesList.innerHTML = "<li>Audit failed</li>";
  }
});
