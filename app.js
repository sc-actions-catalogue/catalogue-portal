const CONFIG = {
  productionApiBase: window.CATALOGUE_API_BASE || "",
  localApiBase: "http://127.0.0.1:8088/api",
  githubIssueUrl: "https://github.com/sc-actions-catalogue/catalogue-control/issues/new",
  catalogueUrl: "https://raw.githubusercontent.com/sc-actions-catalogue/catalogue-control/main/catalogue/catalogue.json",
  controlApiBase: "https://api.github.com/repos/sc-actions-catalogue/catalogue-control/contents"
};

class SubmissionAdapter {
  constructor() {
    this.isLocalPage = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
    this.apiBase = CONFIG.productionApiBase || (this.isLocalPage ? CONFIG.localApiBase : "");
  }

  async submit(payload) {
    if (!this.apiBase) {
      return this.openGitHubIssue(payload);
    }
    const response = await fetch(`${this.apiBase}/requests`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error((await response.json()).error || "Submission failed");
    return response.json();
  }

  async status(requestId) {
    if (!this.apiBase) {
      throw new Error("Hosted status lookup requires the catalogue-control request files or a backend API. Check the review issue or Actions run in GitHub.");
    }
    const response = await fetch(`${this.apiBase}/requests/${encodeURIComponent(requestId)}`);
    if (!response.ok) throw new Error("Request not found");
    return response.json();
  }

  async catalogue() {
    try {
      if (!this.apiBase) throw new Error("No hosted API configured");
      const response = await fetch(`${this.apiBase}/catalogue`);
      if (response.ok) return response.json();
    } catch (_) {}
    try {
      const response = await fetch(`${CONFIG.catalogueUrl}?t=${Date.now()}`, {cache: "no-store"});
      if (response.ok) return response.json();
    } catch (_) {}
    const fallback = await fetch("data/actions.json");
    return fallback.json();
  }

  openGitHubIssue(payload) {
    const title = `[CATALOGUE-REQUEST] ${payload.source_repository}@${payload.requested_reference}`;
    const body = [
      "## Catalogue Onboarding Request",
      "",
      `Source repository: ${payload.source_repository}`,
      `Requested reference: ${payload.requested_reference}`,
      "",
      "## Requestor",
      "",
      `Name: ${payload.requestor.name}`,
      `Email: ${payload.requestor.email || ""}`,
      `GitHub username: ${payload.requestor.github_username || ""}`,
      `Team: ${payload.requestor.team}`,
      `Application: ${payload.requestor.application}`,
      "",
      "## Business justification",
      "",
      payload.business_justification,
      "",
      "## Intended usage",
      "",
      payload.intended_usage,
      "",
      "## Runner",
      "",
      payload.runner_preference,
      "",
      "## Additional comments",
      "",
      payload.comments || ""
    ].join("\n");
    const url = new URL(CONFIG.githubIssueUrl);
    url.searchParams.set("title", title);
    url.searchParams.set("body", body);
    url.searchParams.set("labels", "catalogue-intake");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    return {
      request_id: "Pending GitHub Issue submission",
      status: "DRAFT_ISSUE_OPENED"
    };
  }
}

const adapter = new SubmissionAdapter();
const states = ["SUBMITTED", "VALIDATING", "IMPORTING", "ASSESSING", "AWAITING_REVIEW", "APPROVED", "PUBLISHING", "PUBLISHED"];

function identity(value) {
  return value.includes("@") ? {email: value} : {github_username: value.replace(/^@/, "")};
}

function renderCatalogue(items) {
  const query = document.querySelector("#search").value.toLowerCase();
  const grid = document.querySelector("#catalogue");
  const empty = document.querySelector("#emptyCatalogue");
  grid.innerHTML = "";
  const approved = items.filter(item => item.status !== "REJECTED");
  const filtered = approved.filter(item => JSON.stringify(item).toLowerCase().includes(query));
  empty.style.display = filtered.length ? "none" : "block";
  for (const item of filtered) {
    const node = document.querySelector("#cardTemplate").content.cloneNode(true);
    node.querySelector("h3").textContent = item.display_name || item.name;
    node.querySelector(".desc").textContent = item.description || "Approved Catalogue Action";
    node.querySelector("dl").innerHTML = `
      <dt>Source</dt><dd>${item.source}@${item.source_ref}</dd>
      <dt>Catalogue</dt><dd>${item.catalogue_repo}@${item.catalogue_ref}</dd>
      <dt>Status</dt><dd>${item.status}</dd>
      <dt>Risk</dt><dd>${item.risk}</dd>
      <dt>Assessment</dt><dd>${item.assessment_date || "Unknown"}</dd>
      <dt>Approver</dt><dd>${item.approver || item.reviewer || "Recorded in review"}</dd>
      <dt>Approval reason</dt><dd>${item.approval_reason || "Recorded in review"}</dd>
      <dt>Runner</dt><dd>${runnerSummary(item.runner_requirements)}</dd>`;
    node.querySelector("pre").textContent = item.usage || `- uses: ${item.catalogue_repo}@${item.catalogue_ref}`;
    const report = node.querySelector(".report-link");
    const reportHref = item.assessment_report_url || reportUrl(item.request_id);
    report.href = reportHref;
    report.style.display = reportHref ? "inline-block" : "none";
    grid.appendChild(node);
  }
}

function renderRequests(items) {
  const query = document.querySelector("#search").value.toLowerCase();
  const publishedIds = new Set((window.catalogueItems || []).map(item => item.request_id).filter(Boolean));
  const rows = document.querySelector("#requestRows");
  const empty = document.querySelector("#emptyRequests");
  rows.innerHTML = "";
  const filtered = items
    .filter(item => !publishedIds.has(item.request_id))
    .filter(item => JSON.stringify(item).toLowerCase().includes(query));
  empty.style.display = filtered.length ? "none" : "block";
  for (const item of filtered) {
    const tr = document.createElement("tr");
    const status = displayStatus(item.status);
    tr.innerHTML = `
      <td><a href="${requestUrl(item.request_id)}" target="_blank" rel="noreferrer">${item.request_id}</a></td>
      <td>${item.action}</td>
      <td>${item.requester}</td>
      <td><span class="status-pill ${status.className}">${status.label}</span></td>
      <td>${item.reason || item.recommendation || "Awaiting reviewer decision"}</td>
      <td><a href="${item.report_url}" target="_blank" rel="noreferrer">Report</a></td>`;
    rows.appendChild(tr);
  }
}

function runnerSummary(value) {
  if (!value) return "Unknown";
  return [value.operating_system, value.container_requirement].filter(Boolean).join("; ");
}

function reportUrl(requestId) {
  return requestId ? `https://github.com/sc-actions-catalogue/catalogue-control/blob/main/assessments/${requestId}/report.md` : "";
}

function requestUrl(requestId) {
  return `https://github.com/sc-actions-catalogue/catalogue-control/tree/main/requests/${requestId}`;
}

function displayStatus(status) {
  const value = (status || "AWAITING_REVIEW").toUpperCase();
  if (value === "REJECTED") return {label: "Reject", className: "status-rejected"};
  if (["AWAITING_REVIEW", "SUBMITTED", "VALIDATING", "IMPORTING", "ASSESSING"].includes(value)) {
    return {label: "In review", className: "status-review"};
  }
  if (["FAILED_VALIDATION", "FAILED_IMPORT", "FAILED_ASSESSMENT", "FAILED_PUBLICATION", "APPROVED", "PUBLISHING"].includes(value)) {
    return {label: "On hold", className: "status-hold"};
  }
  return {label: value.replaceAll("_", " "), className: "status-hold"};
}

async function fetchJson(url) {
  const response = await fetch(cacheBust(url), {cache: "no-store"});
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

async function fetchControlJson(path) {
  const response = await fetch(cacheBust(`${CONFIG.controlApiBase}/${path}`), {cache: "no-store"});
  if (!response.ok) return null;
  const payload = await response.json();
  const raw = await fetch(cacheBust(payload.download_url), {cache: "no-store"});
  if (!raw.ok) return null;
  return raw.json();
}

async function loadRequests() {
  try {
    const entries = await fetchJson(CONFIG.controlApiBase + "/requests");
    const requestDirs = entries.filter(entry => entry.type === "dir").map(entry => entry.name).sort().reverse();
    const requests = await Promise.all(requestDirs.map(async requestId => {
      const [request, status, report] = await Promise.all([
        fetchControlJson(`requests/${requestId}/request.json`),
        fetchControlJson(`requests/${requestId}/status.json`),
        fetchControlJson(`assessments/${requestId}/report.json`)
      ]);
      if (!request) return null;
      return {
        request_id: requestId,
        action: `${request.source_repository}@${request.requested_reference}`,
        requester: request.requestor?.name || request.requestor?.github_username || request.requestor?.email || "Unknown",
        status: status?.status || "AWAITING_REVIEW",
        reason: status?.reason || "",
        recommendation: report?.recommendation || "",
        report_url: reportUrl(requestId)
      };
    }));
    window.requestItems = requests.filter(Boolean);
  } catch (_) {
    window.requestItems = [];
  }
  renderRequests(window.requestItems);
}

async function loadCatalogue() {
  const data = await adapter.catalogue();
  window.catalogueItems = data.actions || [];
  renderCatalogue(window.catalogueItems);
  await loadRequests();
}

document.querySelector("#search").addEventListener("input", () => {
  renderCatalogue(window.catalogueItems || []);
  renderRequests(window.requestItems || []);
});

document.querySelector("#onboardForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const who = identity(form.get("identity"));
  const payload = {
    source_repository: form.get("source_repository"),
    requested_reference: form.get("requested_reference"),
    requestor: {
      name: form.get("name"),
      team: form.get("team"),
      application: form.get("application"),
      ...who
    },
    business_justification: form.get("business_justification"),
    intended_usage: form.get("intended_usage"),
    runner_preference: form.get("runner_preference"),
    comments: form.get("comments")
  };
  const result = document.querySelector("#submitResult");
  result.textContent = "Submitting...";
  try {
    const response = await adapter.submit(payload);
    result.textContent = response.status === "DRAFT_ISSUE_OPENED"
      ? "A prefilled GitHub intake issue opened in a new tab. Click Submit new issue there to start assessment."
      : `Submitted. Request ID: ${response.request_id}`;
  } catch (error) {
    result.textContent = error.message;
  }
});

document.querySelector("#statusForm").addEventListener("submit", async event => {
  event.preventDefault();
  const requestId = new FormData(event.target).get("request_id").trim();
  const result = document.querySelector("#statusResult");
  result.textContent = "Checking...";
  try {
    const status = await adapter.status(requestId);
    const index = states.indexOf(status.status);
    const timeline = states.map((state, i) => {
      const mark = i < index ? "✓" : i === index ? "→" : "○";
      const klass = i === index ? "current" : "";
      return `<div class="${klass}">${mark} ${state.replaceAll("_", " ")}</div>`;
    }).join("");
    result.innerHTML = `<strong>${status.request_id}</strong>: ${status.status}<br>${status.reason || ""}<div class="timeline">${timeline}</div>`;
  } catch (error) {
    result.textContent = error.message;
  }
});

loadCatalogue();
