"use strict";

const element = (tag, className, content) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content !== undefined) result.textContent = content;
  return result;
};
const externalLink = (label, url, className) => {
  const link = element("a", className, label);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
};

async function start() {
  const response = await fetch("./agenda.json");
  if (!response.ok) throw new Error(`Agenda request failed (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data.sessions) || !Array.isArray(data.socials) || !Array.isArray(data.venues)) {
    throw new Error("Agenda data is not in the expected format");
  }
  const state = { day: "all", mode: "primary", track: "team", query: "" };
  const trackNames = { team: "Team", leadership: "Leadership" };
  const inTrack = tracks => state.track === "all" ? tracks.length > 0 : tracks.includes(state.track);
  const schedule = document.querySelector("#schedule");
  const results = document.querySelector("#results");
  const socialList = document.querySelector("#social-activities");
  const venueList = document.querySelector("#venues");
  const unmappedList = document.querySelector("#unmapped-venues");
  const mappedSocials = document.querySelector("#mapped-socials");
  const dayTitles = { all: "Wednesday & Thursday", wed: "Wednesday", thu: "Thursday" };
  const locationsBySource = new Map(data.venues.flatMap(venue => venue.sourceIds.map(id => [id, venue])));
  let map;
  let markers;

  function render() {
    const query = state.query.trim().toLocaleLowerCase();
    document.querySelector("#primary-count").textContent = data.sessions.filter(s => inTrack(s.recommendedFor)).length;
    document.querySelector("#alternative-count").textContent = data.sessions.filter(s => inTrack(s.alternativeFor)).length;
    const visible = data.sessions.filter(session =>
      (state.day === "all" || state.day === session.day) &&
      (inTrack(session.recommendedFor) || (state.mode === "all" && inTrack(session.alternativeFor))) &&
      [session.title, session.category, session.reason, session.room].join(" ").toLocaleLowerCase().includes(query)
    );
    const visibleSocials = data.socials.filter(social =>
      (state.day === "all" || state.day === social.day) &&
      [social.title, social.format, social.reason, social.room, social.note,
        locationsBySource.get(social.sourceId).name, locationsBySource.get(social.sourceId).address]
        .join(" ").toLocaleLowerCase().includes(query)
    );
    document.querySelectorAll("button[data-day]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.day === state.day)));
    document.querySelectorAll("[data-mode]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
    document.querySelectorAll("[data-track]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.track === state.track)));
    const guidance = state.track === "all"
      ? "combined tracks overlap; choose a route for a sequenced itinerary"
      : `${trackNames[state.track]} track \u2022 ${state.mode === "primary" ? "sequenced itinerary" : "alternatives may overlap; follow replacement notes"}`;
    results.textContent = `${visible.length} ${visible.length === 1 ? "session" : "sessions"} \u2022 ${guidance}`;
    const socialLink = element("a", "", `${visibleSocials.length} happy hour / after-hours recommendations`);
    socialLink.href = "#social-section";
    results.append(" \u2022 ", socialLink);
    schedule.replaceChildren();
    if (!visible.length) {
      schedule.append(element("div", "empty", "No sessions match the current filters."));
    }
    for (const session of visible) {
      const card = element("article", "entry");
      card.dataset.id = session.id;
      card.dataset.day = session.day;
      const timing = element("div", "timing", session.time);
      timing.append(element("span", "date", session.date));
      const heading = element("div");
      heading.append(externalLink(session.title, session.url, "session-title"));
      const labels = element("div", "labels");
      labels.append(element("span", "label", session.category));
      for (const track of Object.keys(trackNames)) {
        if (state.track !== "all" && state.track !== track) continue;
        if (session.recommendedFor.includes(track)) labels.append(element("span", "label", `${trackNames[track]} recommended`));
        else if (session.alternativeFor.includes(track)) labels.append(element("span", "label alternative", `${trackNames[track]} alternative`));
      }
      heading.append(labels);
      const reason = element("p", "reason", session.reason);
      reason.append(element("span", "location", `${session.format} \u00b7 ${session.room}`));
      for (const [track, note] of Object.entries(session.routeNotes)) {
        if (note && (state.track === "all" || state.track === track)) {
          reason.append(element("span", "routing", `${trackNames[track]}: ${note}`));
        }
      }
      card.append(timing, heading, reason);
      schedule.append(card);
    }
    document.querySelector("#social-days").textContent = {
      all: "Wednesday & Thursday | October 28-29",
      wed: "Wednesday | October 28", thu: "Thursday | October 29"
    }[state.day];
    document.querySelector("#social-results").textContent = `${visibleSocials.length} happy hour / after-hours recommendations \u2022 optional; confirm host details and access`;
    socialList.replaceChildren();
    if (!visibleSocials.length) socialList.append(element("div", "empty", "No happy hour recommendations match the current filters."));
    for (const [day, title] of [["wed", "Wednesday, October 28"], ["thu", "Thursday, October 29"]]) {
      const activities = visibleSocials.filter(social => social.day === day);
      if (activities.length) socialList.append(element("h3", "social-day", title));
      for (const social of activities) {
        const card = element("article", "entry social-entry");
        card.dataset.id = social.id;
        card.dataset.day = social.day;
        card.dataset.sourceId = social.sourceId;
        const timing = element("div", "timing", social.time);
        timing.append(element("span", "date", social.date));
        const heading = element("div");
        heading.append(social.url ? externalLink(social.title, social.url, "session-title") : element("span", "session-title", social.title));
        const labels = element("div", "labels");
        labels.append(element("span", "label alternative", "Optional sponsor gathering"));
        heading.append(labels);
        const reason = element("p", "reason", social.reason);
        reason.append(element("span", "location", `${social.format} \u00b7 ${social.room}`));
        reason.append(element("span", "routing", social.note));
        card.append(timing, heading, reason);
        socialList.append(card);
      }
    }
    renderVenues(visibleSocials);
  }
  document.querySelectorAll("button[data-day]").forEach(button => button.addEventListener("click", () => {
    state.day = button.dataset.day;
    render();
  }));
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    render();
  }));
  document.querySelectorAll("[data-track]").forEach(button => button.addEventListener("click", () => {
    state.track = button.dataset.track;
    render();
  }));
  document.querySelector("#query").addEventListener("input", event => {
    state.query = event.target.value;
    render();
  });
  function activityDetails(social) {
    const detail = element("div", "venue-activity");
    detail.dataset.socialId = social.id;
    detail.append(element("strong", "", social.title),
      element("div", "venue-time", `${social.date} \u00b7 ${social.time}`),
      element("p", "", social.note));
    if (social.url) detail.append(externalLink("Host details / RSVP", social.url, "directions"));
    return detail;
  }
  function renderVenues(socials) {
    const venues = data.venues.map(venue => ({
      ...venue, activities: socials.filter(social => venue.sourceIds.includes(social.sourceId))
    })).filter(venue => venue.activities.length);
    const mapped = venues.filter(venue => venue.position);
    const unmapped = venues.filter(venue => !venue.position);
    const mappedCount = mapped.reduce((total, venue) => total + venue.activities.length, 0);
    mappedSocials.hidden = venues.length === 0;
    document.querySelector("#map-heading").textContent = `Venue map: ${dayTitles[state.day]}`;
    document.querySelector("#map-results").textContent = `${mapped.length} map locations covering ${mappedCount} gatherings \u2022 ${socials.length - mappedCount} awaiting an exact venue`;
    document.querySelector("#venue-map-layout").hidden = mapped.length === 0;
    document.querySelector("#unmapped-socials").hidden = unmapped.length === 0;
    venueList.replaceChildren();
    venueList.scrollTop = 0;
    unmappedList.replaceChildren();
    if (markers) markers.clearLayers();
    for (const venue of venues) {
      const card = element("article", "venue-card");
      card.dataset.venueId = venue.id;
      card.append(element("span", venue.provisional ? "number provisional" : "number", venue.number ?? "?"));
      const body = element("div");
      body.append(element("h3", "", venue.name), element("span", "venue-status", venue.locationNote));
      if (venue.address) body.append(element("span", "address", venue.address));
      if (venue.position) body.append(externalLink(
        venue.provisional ? "Directions to reference location" : "Open directions",
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`, "directions"));
      if (markers && venue.position) {
        const pin = element("span", venue.provisional ? "pin provisional" : "pin", venue.number);
        const icon = L.divIcon({ html: pin, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
        const popup = element("div");
        popup.append(element("strong", "", venue.name), element("p", "", venue.locationNote));
        for (const social of venue.activities) popup.append(activityDetails(social));
        const marker = L.marker(venue.position, { icon, title: venue.name, alt: venue.name })
          .addTo(markers).bindPopup(popup, { maxHeight: 260 });
        const focus = element("button", "directions map-focus", "Show on map");
        focus.type = "button";
        focus.setAttribute("aria-label", `Show ${venue.name} on map`);
        focus.addEventListener("click", () => {
          map.setView(venue.position, 17, { animate: false });
          marker.openPopup();
          document.querySelector("#venue-map").scrollIntoView({ block: "center" });
        });
        body.append(focus);
      }
      for (const social of venue.activities) body.append(activityDetails(social));
      card.append(body);
      (venue.position ? venueList : unmappedList).append(card);
    }
    if (map && mapped.length) {
      map.invalidateSize();
      map.fitBounds(mapped.map(venue => venue.position), { padding: [34, 34], maxZoom: 16, animate: false });
    }
  }
  const container = document.querySelector("#venue-map");
  if (!window.L) {
    container.append(element("p", "map-error", "The map library could not load. Use the venue directions links instead."));
    render();
    return;
  }
  map = L.map(container, { scrollWheelZoom: false });
  markers = L.layerGroup().addTo(map);
  map.on("resize", () => {
    const positions = markers.getLayers().map(marker => marker.getLatLng());
    if (positions.length) map.fitBounds(positions, { padding: [34, 34], maxZoom: 16, animate: false });
  });
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  let mapError;
  tiles.on("tileerror", () => {
    if (!mapError) {
      mapError = element("p", "map-note", "Some map tiles could not load. Venue addresses and directions remain available.");
      container.after(mapError);
    }
  });
  tiles.addTo(map);
  render();
}

start().catch(error => {
  console.error(error);
  document.querySelector("#results").textContent = "The agenda could not load. Please reload or contact your account team.";
  document.querySelector("#social-results").textContent = "Happy hour recommendations could not load. Please reload or contact your account team.";
});
