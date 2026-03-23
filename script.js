(() => {
  const G = 9.80665;
  const KG_TO_LB = 2.2046226218;
  const CM_TO_IN = 0.3937007874;

  const state = {
    unit: "metric",
    otaWeightKg: 5,
    otaDistanceCm: 15,
    shaftLengthCm: 25,
    newCwWeightKg: 2,
    newCwThicknessCm: 5,
    counterweights: [],
    dragId: null,
    nextId: 1,
  };

  const el = {
    unitSystem: document.getElementById("unitSystem"),
    otaWeight: document.getElementById("otaWeight"),
    otaDistance: document.getElementById("otaDistance"),
    shaftLength: document.getElementById("shaftLength"),
    otaWeightUnit: document.getElementById("otaWeightUnit"),
    otaDistanceUnit: document.getElementById("otaDistanceUnit"),
    shaftLengthUnit: document.getElementById("shaftLengthUnit"),
    newCwWeight: document.getElementById("newCwWeight"),
    newCwThickness: document.getElementById("newCwThickness"),
    newCwWeightValue: document.getElementById("newCwWeightValue"),
    newCwWeightUnit: document.getElementById("newCwWeightUnit"),
    newCwThicknessValue: document.getElementById("newCwThicknessValue"),
    newCwThicknessUnit: document.getElementById("newCwThicknessUnit"),
    addCounterweight: document.getElementById("addCounterweight"),
    stats: document.getElementById("stats"),
    scene: document.getElementById("scene"),
    shaftLine: document.getElementById("shaftLine"),
    otaCircle: document.getElementById("otaCircle"),
    otaText: document.getElementById("otaText"),
    otaDistLabel: document.getElementById("otaDistLabel"),
    otaWeightLabel: document.getElementById("otaWeightLabel"),
    weightLayer: document.getElementById("weightLayer"),
    labelLayer: document.getElementById("labelLayer"),
  };

  const geom = {
    axisX: 450,
    axisY: 250,
    axisRadius: 32,
    shaftMinPx: 140,
    shaftMaxPx: 330,
  };

  const fmt = (v, digits = 2) => Number(v).toFixed(digits);

  const massToDisplay = (kg) => (state.unit === "metric" ? kg : kg * KG_TO_LB);
  const massFromDisplay = (v) => (state.unit === "metric" ? v : v / KG_TO_LB);
  const distToDisplay = (cm) => (state.unit === "metric" ? cm : cm * CM_TO_IN);
  const distFromDisplay = (v) => (state.unit === "metric" ? v : v / CM_TO_IN);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getShaftPixelLength() {
    const minCm = 5;
    const maxCm = 60;
    const t = clamp((state.shaftLengthCm - minCm) / (maxCm - minCm), 0, 1);
    return geom.shaftMinPx + t * (geom.shaftMaxPx - geom.shaftMinPx);
  }

  function getShaftPxPerCm() {
    return getShaftPixelLength() / state.shaftLengthCm;
  }

  function distanceCmToX(distanceCm) {
    return geom.axisX - distanceCm * getShaftPxPerCm();
  }

  function xToDistanceCm(x) {
    return (geom.axisX - x) / getShaftPxPerCm();
  }

  function normalizeCounterweightPositions() {
    state.counterweights.forEach((w) => {
      w.distanceCm = clamp(w.distanceCm, w.thicknessCm / 2, state.shaftLengthCm - w.thicknessCm / 2);
    });

    const sorted = [...state.counterweights].sort((a, b) => a.distanceCm - b.distanceCm);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const minDist = (prev.thicknessCm + cur.thicknessCm) / 2;
      if (cur.distanceCm - prev.distanceCm < minDist) {
        cur.distanceCm = prev.distanceCm + minDist;
      }
    }

    for (let i = sorted.length - 2; i >= 0; i -= 1) {
      const next = sorted[i + 1];
      const cur = sorted[i];
      const minDist = (next.thicknessCm + cur.thicknessCm) / 2;
      const maxForCur = next.distanceCm - minDist;
      if (cur.distanceCm > maxForCur) {
        cur.distanceCm = maxForCur;
      }
    }

    sorted.forEach((w) => {
      w.distanceCm = clamp(w.distanceCm, w.thicknessCm / 2, state.shaftLengthCm - w.thicknessCm / 2);
    });
  }

  function constrainDraggedWeight(dragged, targetDistanceCm) {
    const minCenter = dragged.thicknessCm / 2;
    const maxCenter = state.shaftLengthCm - dragged.thicknessCm / 2;
    if (minCenter > maxCenter) {
      return dragged.distanceCm;
    }

    const blocked = state.counterweights
      .filter((w) => w.id !== dragged.id)
      .map((w) => {
        const gap = (w.thicknessCm + dragged.thicknessCm) / 2;
        return {
          start: clamp(w.distanceCm - gap, minCenter, maxCenter),
          end: clamp(w.distanceCm + gap, minCenter, maxCenter),
        };
      })
      .filter((b) => b.start < b.end)
      .sort((a, b) => a.start - b.start);

    const freeIntervals = [];
    let cursor = minCenter;
    blocked.forEach((b) => {
      if (b.start > cursor) {
        freeIntervals.push({ start: cursor, end: b.start });
      }
      cursor = Math.max(cursor, b.end);
    });
    if (cursor < maxCenter) {
      freeIntervals.push({ start: cursor, end: maxCenter });
    }

    if (freeIntervals.length === 0) {
      return clamp(dragged.distanceCm, minCenter, maxCenter);
    }

    let best = freeIntervals[0].start;
    let bestDelta = Infinity;
    freeIntervals.forEach((interval) => {
      const candidate = clamp(targetDistanceCm, interval.start, interval.end);
      const delta = Math.abs(candidate - targetDistanceCm);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    });

    return best;
  }

  function findAvailableDistanceForThickness(thicknessCm) {
    const minCenter = thicknessCm / 2;
    const maxCenter = state.shaftLengthCm - thicknessCm / 2;
    if (minCenter > maxCenter) {
      return null;
    }

    const blocked = state.counterweights
      .map((w) => {
        const gap = (w.thicknessCm + thicknessCm) / 2;
        return {
          start: clamp(w.distanceCm - gap, minCenter, maxCenter),
          end: clamp(w.distanceCm + gap, minCenter, maxCenter),
        };
      })
      .filter((b) => b.start < b.end)
      .sort((a, b) => a.start - b.start);

    let freeStart = minCenter;
    for (const b of blocked) {
      if (b.start > freeStart) {
        return b.start;
      }
      freeStart = Math.max(freeStart, b.end);
    }

    if (freeStart <= maxCenter) {
      return maxCenter;
    }
    return null;
  }

  function updateAddButtonState() {
    const thicknessCm = clamp(state.newCwThicknessCm, 1, 30);
    const available = findAvailableDistanceForThickness(thicknessCm);
    const hasRoom = available != null;

    el.addCounterweight.disabled = !hasRoom;
    el.addCounterweight.title = hasRoom ? "" : "No room left on shaft for this counterweight thickness.";
  }

  function addCounterweight() {
    const thicknessCm = clamp(state.newCwThicknessCm, 1, 30);
    const weightKg = clamp(state.newCwWeightKg, 0.1, 50);
    const distanceCm = findAvailableDistanceForThickness(thicknessCm);
    if (distanceCm == null) {
      updateAddButtonState();
      return;
    }

    const placed = {
      id: state.nextId++,
      massKg: weightKg,
      thicknessCm,
      distanceCm,
    };

    state.counterweights.push(placed);
    normalizeCounterweightPositions();
    render();
  }

  function computeBalance() {
    const otaTorqueNm = state.otaWeightKg * G * (state.otaDistanceCm / 100);

    let cwTorqueNm = 0;
    state.counterweights.forEach((w) => {
      cwTorqueNm += w.massKg * G * (w.distanceCm / 100);
    });

    const netNm = cwTorqueNm - otaTorqueNm;
    return { otaTorqueNm, cwTorqueNm, netNm };
  }

  function renderStats() {
    const { otaTorqueNm, cwTorqueNm, netNm } = computeBalance();
    const absNetNm = Math.abs(netNm);
    const heavier = absNetNm < 0.01 ? "balanced" : netNm > 0 ? "left" : "right";
    const isDanger = absNetNm > 2.0;
    const heavinessMassKg = absNetNm / (G * (state.otaDistanceCm / 100 || 0.0001));

    const heavinessDisplay = massToDisplay(heavinessMassKg);
    const massUnit = state.unit === "metric" ? "kg" : "lb";

    let heavyText;
    if (heavier === "balanced") {
      heavyText = "Sides are balanced.";
    } else if (heavier === "left") {
      heavyText = `Counterweight side is heavier by ${fmt(heavinessDisplay)} ${massUnit} equivalent at OTA radius.`;
    } else {
      heavyText = `OTA side is heavier by ${fmt(heavinessDisplay)} ${massUnit} equivalent at OTA radius.`;
    }

    el.stats.innerHTML = `
      <div><strong>OTA Torque:</strong> ${fmt(otaTorqueNm)} N m</div>
      <div><strong>Counterweight Torque:</strong> ${fmt(cwTorqueNm)} N m</div>
      <div><strong>Unbalanced Torque:</strong> ${fmt(absNetNm)} N m</div>
      <div class="heavy ${heavier}${isDanger ? " danger" : ""}"><strong>Heavier Side:</strong> ${heavyText}</div>
    `;
  }

  function renderWeights() {
    el.weightLayer.innerHTML = "";
    el.labelLayer.innerHTML = "";

    const pxPerCm = getShaftPxPerCm();

    state.counterweights.forEach((w) => {
      const xCenter = distanceCmToX(w.distanceCm);
      const wRect = Math.max(14, w.thicknessCm * pxPerCm);
      const h = wRect * 3;
      const x = xCenter - wRect / 2;
      const y = geom.axisY - h / 2;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", wRect);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 6);
      rect.setAttribute("class", `weight${state.dragId === w.id ? " dragging" : ""}`);
      rect.dataset.id = String(w.id);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const dDisplay = distToDisplay(w.distanceCm);
      const dUnit = state.unit === "metric" ? "cm" : "in";
      label.textContent = `${fmt(dDisplay, 1)} ${dUnit}`;
      label.setAttribute("x", xCenter);
      label.setAttribute("y", y - 18);
      label.setAttribute("class", "distLabel");

      const inside = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const mDisplay = massToDisplay(w.massKg);
      const mUnit = state.unit === "metric" ? "kg" : "lb";
      inside.textContent = `${fmt(mDisplay, 1)} ${mUnit}`;
      inside.setAttribute("x", xCenter);
      inside.setAttribute("y", y - 5);
      inside.setAttribute("class", "distLabel");
      inside.style.fontSize = "12px";

      el.weightLayer.appendChild(rect);
      el.labelLayer.appendChild(label);
      el.labelLayer.appendChild(inside);
    });
  }

  function renderShaft() {
    const pxLen = getShaftPixelLength();
    const x2 = geom.axisX - pxLen;
    el.shaftLine.setAttribute("x2", x2.toString());
  }

  function renderOta() {
    const centerDistancePx = state.otaDistanceCm * getShaftPxPerCm();
    const cx = geom.axisX + centerDistancePx;
    const cy = geom.axisY;
    const radius = Math.max(8, centerDistancePx - geom.axisRadius);
    const topY = Math.max(18, cy - radius - 10);
    const dUnit = state.unit === "metric" ? "cm" : "in";
    const mUnit = state.unit === "metric" ? "kg" : "lb";
    const dDisplay = distToDisplay(state.otaDistanceCm);
    const mDisplay = massToDisplay(state.otaWeightKg);

    el.otaCircle.setAttribute("cx", cx.toString());
    el.otaCircle.setAttribute("cy", cy.toString());
    el.otaCircle.setAttribute("r", radius.toString());

    el.otaText.setAttribute("x", cx.toString());
    el.otaText.setAttribute("y", cy.toString());
    el.otaText.style.fontSize = `${clamp(radius * 0.38, 12, 44)}px`;

    el.otaDistLabel.setAttribute("x", cx.toString());
    el.otaDistLabel.setAttribute("y", topY.toString());
    el.otaDistLabel.textContent = `${fmt(dDisplay, 1)} ${dUnit}`;

    el.otaWeightLabel.setAttribute("x", cx.toString());
    el.otaWeightLabel.setAttribute("y", (topY + 13).toString());
    el.otaWeightLabel.textContent = `${fmt(mDisplay, 1)} ${mUnit}`;
  }

  function syncUnitLabels() {
    const m = state.unit === "metric" ? "kg" : "lb";
    const d = state.unit === "metric" ? "cm" : "in";
    el.otaWeightUnit.textContent = m;
    el.otaDistanceUnit.textContent = d;
    el.shaftLengthUnit.textContent = d;
    el.newCwWeightUnit.textContent = m;
    el.newCwThicknessUnit.textContent = d;
  }

  function syncInputsFromState() {
    el.otaWeight.value = fmt(massToDisplay(state.otaWeightKg), 2);
    el.otaDistance.value = fmt(distToDisplay(state.otaDistanceCm), 2);
    el.shaftLength.value = fmt(distToDisplay(state.shaftLengthCm), 2);

    const newMassDisplay = massToDisplay(state.newCwWeightKg);
    const newThicknessDisplay = distToDisplay(state.newCwThicknessCm);

    if (state.unit === "metric") {
      el.newCwWeight.min = "0.5";
      el.newCwWeight.max = "10";
      el.newCwWeight.step = "0.1";
      el.newCwThickness.min = "1";
      el.newCwThickness.max = "12";
      el.newCwThickness.step = "0.5";
    } else {
      el.newCwWeight.min = "1";
      el.newCwWeight.max = "22";
      el.newCwWeight.step = "0.2";
      el.newCwThickness.min = "0.5";
      el.newCwThickness.max = "5";
      el.newCwThickness.step = "0.25";
    }

    el.newCwWeight.value = String(newMassDisplay);
    el.newCwThickness.value = String(newThicknessDisplay);
    el.newCwWeightValue.textContent = fmt(newMassDisplay, 1);
    el.newCwThicknessValue.textContent = fmt(newThicknessDisplay, 1);
  }

  function render() {
    normalizeCounterweightPositions();
    renderShaft();
    renderOta();
    renderWeights();
    renderStats();
    syncUnitLabels();
    syncInputsFromState();
    updateAddButtonState();
  }

  function onUnitSwitch(nextUnit) {
    if (nextUnit === state.unit) {
      return;
    }

    state.unit = nextUnit;
    render();
  }

  function handleNumberInputs() {
    el.otaWeight.addEventListener("change", () => {
      const v = parseFloat(el.otaWeight.value);
      if (Number.isFinite(v) && v > 0) {
        state.otaWeightKg = massFromDisplay(v);
      }
      render();
    });

    el.otaDistance.addEventListener("change", () => {
      const v = parseFloat(el.otaDistance.value);
      if (Number.isFinite(v) && v > 0) {
        state.otaDistanceCm = clamp(distFromDisplay(v), 1, 300);
      }
      render();
    });

    el.shaftLength.addEventListener("change", () => {
      const v = parseFloat(el.shaftLength.value);
      if (Number.isFinite(v) && v > 0) {
        state.shaftLengthCm = clamp(distFromDisplay(v), 5, 300);
      }
      render();
    });
  }

  function handleSliders() {
    el.newCwWeight.addEventListener("input", () => {
      const displayVal = parseFloat(el.newCwWeight.value);
      if (!Number.isFinite(displayVal)) {
        return;
      }
      state.newCwWeightKg = massFromDisplay(displayVal);
      el.newCwWeightValue.textContent = fmt(displayVal, 1);
      updateAddButtonState();
    });

    el.newCwThickness.addEventListener("input", () => {
      const displayVal = parseFloat(el.newCwThickness.value);
      if (!Number.isFinite(displayVal)) {
        return;
      }
      state.newCwThicknessCm = distFromDisplay(displayVal);
      el.newCwThicknessValue.textContent = fmt(displayVal, 1);
      updateAddButtonState();
    });

    el.addCounterweight.addEventListener("click", addCounterweight);
  }

  function attachDragHandlers() {
    function getPoint(evt) {
      const pt = el.scene.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      return pt.matrixTransform(el.scene.getScreenCTM().inverse());
    }

    el.scene.addEventListener("pointerdown", (evt) => {
      const target = evt.target;
      if (!(target instanceof SVGElement)) {
        return;
      }
      if (!target.classList.contains("weight")) {
        return;
      }

      const id = Number(target.dataset.id);
      if (!id) {
        return;
      }

      state.dragId = id;
      target.setPointerCapture(evt.pointerId);
      render();
    });

    el.scene.addEventListener("pointermove", (evt) => {
      if (state.dragId == null) {
        return;
      }
      const cw = state.counterweights.find((w) => w.id === state.dragId);
      if (!cw) {
        return;
      }

      const p = getPoint(evt);
      const rawDistance = xToDistanceCm(p.x);
      cw.distanceCm = constrainDraggedWeight(cw, rawDistance);
      render();
    });

    function endDrag() {
      if (state.dragId == null) {
        return;
      }
      state.dragId = null;
      render();
    }

    el.scene.addEventListener("pointerup", endDrag);
    el.scene.addEventListener("pointercancel", endDrag);
    el.scene.addEventListener("pointerleave", (evt) => {
      if ((evt.buttons & 1) === 0) {
        endDrag();
      }
    });
  }

  function attachHelpTooltips() {
    const helpButtons = Array.from(document.querySelectorAll(".helpBtn[data-help]"));
    if (helpButtons.length === 0) {
      return;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "helpTooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    let activeBtn = null;

    function hideTooltip() {
      tooltip.hidden = true;
      activeBtn = null;
    }

    function showTooltip(btn) {
      const text = btn.dataset.help || "";
      if (!text) {
        hideTooltip();
        return;
      }

      tooltip.textContent = text;
      tooltip.hidden = false;
      activeBtn = btn;

      const rect = btn.getBoundingClientRect();
      const gap = 8;

      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;

      let left = rect.left + rect.width / 2 - width / 2;
      left = clamp(left, 8, window.innerWidth - width - 8);

      let top = rect.bottom + gap;
      if (top + height > window.innerHeight - 8) {
        top = rect.top - height - gap;
      }
      top = clamp(top, 8, window.innerHeight - height - 8);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    helpButtons.forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (activeBtn === btn && !tooltip.hidden) {
          hideTooltip();
          return;
        }
        showTooltip(btn);
      });
    });

    window.addEventListener("resize", () => {
      if (activeBtn && !tooltip.hidden) {
        showTooltip(activeBtn);
      }
    });

    document.addEventListener("click", (evt) => {
      const target = evt.target;
      if (!(target instanceof Element)) {
        hideTooltip();
        return;
      }
      if (target.closest(".helpBtn") || target.closest(".helpTooltip")) {
        return;
      }
      hideTooltip();
    });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") {
        hideTooltip();
      }
    });
  }

  function init() {
    el.unitSystem.addEventListener("change", () => onUnitSwitch(el.unitSystem.value));
    handleNumberInputs();
    handleSliders();
    attachDragHandlers();
    attachHelpTooltips();
    render();
  }

  init();
})();
