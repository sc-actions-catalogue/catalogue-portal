const CONFIG = {
  productionApiBase: window.CATALOGUE_API_BASE || "",
  localApiBase: "http://127.0.0.1:8088/api",
  githubIssueUrl: "https://github.com/sc-actions-catalogue/catalogue-control/issues/new",
  catalogueUrl: "https://raw.githubusercontent.com/sc-actions-catalogue/catalogue-control/main/catalogue/catalogue.json",
  requestsUrl: "data/requests.json"
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
      const data = await fetchJson(CONFIG.requestsUrl);
      const match = (data.requests || []).find(item => item.request_id.toLowerCase() === requestId.toLowerCase());
      if (!match) throw new Error("Request not found in the published status table yet. Check the GitHub issue or Actions run.");
      return match;
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
    const card = node.querySelector(".action-card");
    card.querySelector("h3").textContent = item.display_name || item.name;
    card.querySelector(".desc").textContent = item.description || "Approved Catalogue Action";
    const meta = card.querySelector(".card-meta");
    meta.innerHTML = "";
    addTag(meta, `${item.risk || "Unknown"} risk`);
    addTag(meta, `${item.source}@${item.source_ref}`);
    addTag(meta, item.approver || item.reviewer || "Approved");
    card.querySelector("code").textContent = item.usage || `- uses: ${item.catalogue_repo}${item.catalogue_path ? `/${item.catalogue_path}` : ""}@${item.catalogue_ref}`;
    card.addEventListener("click", () => openActionDialog(item));
    grid.appendChild(node);
  }
}

function openActionDialog(item) {
  const dialog = document.querySelector("#actionDialog");
  document.querySelector("#dialogTitle").textContent = item.display_name || item.name;
  document.querySelector("#dialogDescription").textContent = item.description || "Approved Catalogue Action";
  const facts = document.querySelector("#dialogFacts");
  facts.innerHTML = "";
  addFact(facts, "Source", `${item.source}@${item.source_ref}`);
  addFact(facts, "Catalogue", `${item.catalogue_repo}${item.catalogue_path ? `/${item.catalogue_path}` : ""}@${item.catalogue_ref}`);
  addFact(facts, "Status", item.status || "APPROVED");
  addFact(facts, "Risk", item.risk || "Unknown");
  addFact(facts, "Assessment", item.assessment_date || "Unknown");
  addFact(facts, "Approver", item.approver || item.reviewer || "Recorded in review");
  addFact(facts, "Approval reason", item.approval_reason || "Recorded in review");
  addFact(facts, "Runner", runnerSummary(item.runner_requirements));
  document.querySelector("#dialogUsage").textContent = item.usage || `- uses: ${item.catalogue_repo}${item.catalogue_path ? `/${item.catalogue_path}` : ""}@${item.catalogue_ref}`;
  const network = document.querySelector("#dialogNetwork");
  network.innerHTML = "";
  for (const entry of (item.network_requirements || []).slice(0, 20)) {
    const tag = document.createElement("span");
    tag.textContent = entry.domain || entry;
    network.appendChild(tag);
  }
  if (!network.children.length) {
    const tag = document.createElement("span");
    tag.textContent = "No explicit network requirements recorded";
    network.appendChild(tag);
  }
  const report = document.querySelector("#dialogReport");
  const reportHref = item.assessment_report_url || reportUrl(item.request_id);
  report.href = reportHref;
  report.style.display = reportHref ? "inline-block" : "none";
  dialog.showModal();
}

function addTag(parent, value) {
  const tag = document.createElement("span");
  tag.textContent = value;
  parent.appendChild(tag);
}

function addFact(list, label, value) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  list.append(dt, dd);
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
    const idCell = document.createElement("td");
    const idLink = document.createElement("a");
    idLink.href = requestUrl(item.request_id);
    idLink.target = "_blank";
    idLink.rel = "noreferrer";
    idLink.textContent = item.request_id;
    idCell.appendChild(idLink);
    const actionCell = document.createElement("td");
    actionCell.textContent = item.action;
    const requesterCell = document.createElement("td");
    requesterCell.textContent = item.requester;
    const statusCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `status-pill ${status.className}`;
    pill.textContent = status.label;
    statusCell.appendChild(pill);
    const reasonCell = document.createElement("td");
    reasonCell.textContent = item.reason || item.recommendation || "Awaiting reviewer decision";
    const reportCell = document.createElement("td");
    if (item.report_url) {
      const reportLink = document.createElement("a");
      reportLink.href = item.report_url;
      reportLink.target = "_blank";
      reportLink.rel = "noreferrer";
      reportLink.textContent = "Report";
      reportCell.appendChild(reportLink);
    } else {
      reportCell.textContent = "Pending";
    }
    tr.append(idCell, actionCell, requesterCell, statusCell, reasonCell, reportCell);
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

async function loadRequests() {
  try {
    const data = await fetchJson(CONFIG.requestsUrl);
    window.requestItems = data.requests || [];
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

document.querySelector("#closeDialog").addEventListener("click", () => {
  document.querySelector("#actionDialog").close();
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
    result.textContent = "";
    const summary = document.createElement("strong");
    summary.textContent = `${status.request_id}: ${status.status}`;
    const reason = document.createElement("div");
    reason.textContent = status.reason || "";
    const timeline = document.createElement("div");
    timeline.className = "timeline";
    for (const [i, state] of states.entries()) {
      const item = document.createElement("div");
      const mark = i < index ? "✓" : i === index ? "→" : "○";
      if (i === index) item.className = "current";
      item.textContent = `${mark} ${state.replaceAll("_", " ")}`;
      timeline.appendChild(item);
    }
    result.append(summary, reason, timeline);
  } catch (error) {
    result.textContent = error.message;
  }
});

loadCatalogue();
