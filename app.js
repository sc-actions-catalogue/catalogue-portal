const CONFIG = {
  productionApiBase: window.CATALOGUE_API_BASE || "",
  localApiBase: "http://127.0.0.1:8088/api"
};

class SubmissionAdapter {
  constructor() {
    this.isLocalPage = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
    this.apiBase = CONFIG.productionApiBase || (this.isLocalPage ? CONFIG.localApiBase : "");
  }

  requireApi() {
    if (!this.apiBase) {
      throw new Error("Submission backend is not configured for this hosted Catalogue portal.");
    }
  }

  async submit(payload) {
    this.requireApi();
    const response = await fetch(`${this.apiBase}/requests`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error((await response.json()).error || "Submission failed");
    return response.json();
  }

  async status(requestId) {
    this.requireApi();
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
    const fallback = await fetch("data/actions.json");
    return fallback.json();
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
  const filtered = items.filter(item => JSON.stringify(item).toLowerCase().includes(query));
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
      <dt>Runner</dt><dd>${runnerSummary(item.runner_requirements)}</dd>`;
    node.querySelector("pre").textContent = item.usage || `- uses: ${item.catalogue_repo}@${item.catalogue_ref}`;
    grid.appendChild(node);
  }
}

function runnerSummary(value) {
  if (!value) return "Unknown";
  return [value.operating_system, value.container_requirement].filter(Boolean).join("; ");
}

async function loadCatalogue() {
  const data = await adapter.catalogue();
  window.catalogueItems = data.actions || [];
  renderCatalogue(window.catalogueItems);
}

document.querySelector("#search").addEventListener("input", () => renderCatalogue(window.catalogueItems || []));

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
    result.textContent = `Submitted. Request ID: ${response.request_id}`;
  } catch (error) {
    result.textContent = `${error.message} Ask the Catalogue owner to deploy the secure submission service and set CATALOGUE_API_BASE.`;
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
    result.textContent = `${error.message} Ask the Catalogue owner to deploy the secure submission service and set CATALOGUE_API_BASE.`;
  }
});

loadCatalogue();
