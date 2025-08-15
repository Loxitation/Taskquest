// Filter bar logic for TaskQuest
export function renderFilterBar(currentFilter, onFilterChange) {
  let bar = document.querySelector(".filter-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "filter-bar";
    document.querySelector("section:last-of-type").prepend(bar);
  }
  bar.innerHTML = `
    <button data-filter="all" class="${currentFilter === "all" ? "active" : ""}">Alle</button>
    <button data-filter="offen" class="${currentFilter === "offen" ? "active" : ""}">Offen</button>
    <button data-filter="eingereicht" class="${currentFilter === "eingereicht" ? "active" : ""}">Eingereicht</button>
    <button data-filter="erledigt" class="${currentFilter === "erledigt" ? "active" : ""}">Erledigt</button>
  `;
  bar.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      onFilterChange(btn.dataset.filter);
    });
  });
}
