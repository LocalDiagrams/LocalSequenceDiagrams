// Copyright (c) 2024 James Kilts
// Licensed under AGPL


// The process of converting a script into an SVG rendered image is broken down
// into 3 main parts: Parsing the script into arrays, calculating the placements
// of the actors and events, and finally rendering the actors and events into
// SVG elements.
//
// While parsing the script, a stack of events allows for nested structure while
// allowing for a simple line-by-line token processing.
//
// The internal data structures held for actors and events look like the following:
//
// const actors = [
//     { type: "actor", caption: "string1" },
//     { type: "participant", caption: "string2" },
//     { type: "participant", caption: "string3" },
//     { type: "participant", caption: "yo" }
// ];
//
// const events = [
//     { type: "signal", src: "yo", dest: "string3", caption: "from yo to three", slope: 5, open: true },
//     { type: "note", src: "yo", caption: "thinking about it much much longer", align: "left" },
//     { type: "alt", cases: [
//         { caption: "success", events: [
//             { type: "signal", caption: "again one to two", src: "string1", dest: "string2" }
//         ]}
//     ]}
// ];
//
// The process of placing the elements augments those data structures with information
// about size and location.  While the vertical placement is rather straight-forward,
// the majority of the placement logic calculates the "gaps" between the participant
// swim-lanes, mainly due to events that occupy the gap.
//
// Since size and location are preserved during placement, the rendering stage can focus
// on the output-specific format, namely SVG.

class LocalSequenceDiagrams {
    constructor(colorForeground = "#000", colorBackground = "#fff") {
      this.color = colorForeground;
      this.colorBg = colorBackground;
      this.padding = 10;
    }
  
    scriptToSvgImage(script) {
      const svgString = this.scriptToSvgText(script);
      const svgImage = new Image();
      svgImage.src = "data:image/svg+xml," + encodeURIComponent(svgString);
      return svgImage;
    }
  
    scriptToSvgText(script) {
      const { actors, events } = this.parseScriptToArrays(script);
      const { width, height } = this.calculatePlacements(actors, events);
      return this.renderSvgElements(actors, events, width, height);
    }
  
    parseScriptToArrays(script) {
      // Keyword commands
      const participants = ['participant','actor'];
      const annotations = ['note','ref','state'];
      const synchrony = ['parallel','serial'];
      const lifetime = ['activate','deactivate','destroy'];
      const conditionalGroupings = ['alt','opt','loop','par','seq'];
  
      const actors = [];
      const events = [];
      const eventStack = [events];
  
      const lines = script.split('\n');
      for (const line of lines) {
          const trimmedLine = line.trim();
  
          let spaceIndex = trimmedLine.indexOf(' ');
          let command = spaceIndex == -1 ? trimmedLine : trimmedLine.slice(0, spaceIndex);
          let text = trimmedLine.slice(spaceIndex + 1);
  
          // GROUPINGS
  
          // "end" can terminate annotations or conditional groupings
          if (command === 'end') {
              if (eventStack.length > 1) {
                  eventStack.pop();
              }
  
              // Conditional groupings are double nested on the event stack
              if (conditionalGroupings.includes(eventStack.at(-1).type)) {
                  eventStack.pop();
              }
          }
  
          // ANNOTATIONS
  
          // if the current item in the stack is an annotation, that means we are collecting multi-line text
          else if (annotations.includes(eventStack.at(-1).type)) {
              eventStack.at(-1).caption += trimmedLine + '\n';
          }
          else if (annotations.includes(command)) {
              let [location, caption] = text.split(':');
              const [align, where, src] = location.split(' ');
  
              // If the ":" is not present, that means multi-line mode.
              // Start as an empty string and push to the event stack
              let multiline = !caption;
              caption = (caption || "").trim();
  
              let note = { type: command, caption, align, src };
              eventStack.at(-1).push(note);
  
              if (multiline) {
                  eventStack.push(note);
              }
          }
  
          // PARTICIPANTS
  
          else if (participants.includes(command)) {
              let [caption, alias] = text.split(' as ');
              if (!alias) alias = caption;
              actors.push({ type: command, caption, alias });
          }
  
          // CONDITIONAL GROUPINGS
  
          else if (conditionalGroupings.includes(command)) {
              let alt = { type: command, cases: [{ caption: text, events: [] }] };
              eventStack.at(-1).push(alt);
              eventStack.push(alt);
              eventStack.push(alt.cases[0].events);
          }
          else if (command === 'else') {
              if (eventStack.length > 1) {
                  eventStack.pop();
              }
  
              // ensure that the active level is of type conditionalGroupings
              if (conditionalGroupings.includes(eventStack.at(-1).type)) {
                  let c = { caption: text, events: [] };
                  eventStack.at(-1).cases.push(c);
                  eventStack.push(c.events);
              }
          }
  
          // LIFETIME
  
          else if (lifetime.includes(command)) {
              eventStack.at(-1).push({ type: command, cases: [{ caption: text, events: [] }] });
          }
  
          // LAYOUT CONTROLS
  
          else if (synchrony.includes(command)) {
              let e = { type: command, events: [] };
              eventStack.at(-1).push(e);
              eventStack.push(e.events);
          }
          else if (command === '}') {
              if (eventStack.length > 1) {
                  eventStack.pop();
              }
          }
  
          // NUMBERING
  
          else if (command === 'autonumber') {
              eventStack.at(-1).push({ type: command, start: text });
          }
  
          // COMMENTS
  
          else if (command.startsWith('#')) {
              // ignore
          }
  
          // SIGNALS
  
          else {
              let [srcDest, caption] = this.splitOnColonEscaped(trimmedLine);
              let [src, dest] = srcDest.split('->');
  
              if (caption && dest) {
                  caption = caption.trim();
                  dest = dest.trim().replace(/"/g,'');
                  src = src.trim().replace(/"/g,'');
  
                  let dotted = false;
                  if (src.endsWith('-')) {
                      src = src.slice(0, -1);
                      dotted = true;
                  }
  
                  let open = false;
                  if (dest.startsWith('>')) {
                      dest = dest.slice(1);
                      open = true;
                  }
  
                  let newActor = false;
                  if (dest.startsWith('*')) {
                      dest = dest.slice(1);
                      newActor = true;
                  }
  
                  let isActivated = false;
                  if (dest.startsWith('+')) {
                      dest = dest.slice(1);
                      isActivated = true;
                  }
  
                  let isDeactivated = false;
                  if (dest.startsWith('-')) {
                      dest = dest.slice(1);
                      isDeactivated = true;
                  }
  
                  eventStack.at(-1).push({ type: 'signal', caption, src, dest, dotted, open });
  
                  if (isActivated) {
                      eventStack.at(-1).push({ type: 'activate', src: dest });
                  }
  
                  if (isDeactivated) {
                      eventStack.at(-1).push({ type: 'deactivate', src: dest });
                  }
  
                  // If the source or destination is not yet in the actors array, add it
  
                  if (!actors.find(a => a.caption === src)) {
                      actors.push({ type: 'participant', caption: src });
                  }
                  if (!actors.find(a => a.caption === dest)) {
                      actors.push({ type: 'participant', caption: dest });
                  }
              }
          }
      }
  
      return { actors, events };
    }
  
    splitOnColonEscaped(input) {
      for (let i = 0, quoted = false; i < input.length; i++) {
          if (input[i] === '"') {
              quoted = !quoted;
  
          } else if (input[i] === ':' && !quoted) {
              return [input.slice(0, i), input.slice(i+1)];
          }
      }
  
      return [input, ""];
    }
  
    calculatePlacements(actors, events) {
      const actorDict = actors.reduce((dict, val, idx) => { dict[val.caption] = [val, idx]; return dict; }, {});
      const gaps = Array.from({ length: actors.length + 1 }, () => 0);
  
      // Calculate ACTOR gaps and widths
  
      for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          const bbox = this.calculateTextDimensions(actor.caption);
  
          actor.height = bbox.height + 2 * this.padding;
          actor.width = bbox.width + 2 * this.padding;
  
          gaps[i] += (actor.width / 2) + this.padding;
          gaps[i+1] += (actor.width / 2) + this.padding;
      }
  
      // Calculate EVENT gaps and widths
      // (Notes and signal captions can affect actor placement)
  
      let gapMinSizeBetweenLanes = this.calculateLaneGapsAndTextSize(actorDict, events);
  
      // Distribute the needed space between the lanes if there's not enough room
      // First, CONTIGUOUS and SAME lanes
  
      for (let i = 0; i < gapMinSizeBetweenLanes.length; i++) {
          const g = gapMinSizeBetweenLanes[i];
  
          var idx1 = Math.min(g[0], g[1]);
          var idx2 = Math.max(g[0], g[1]);
  
          // Contiguous
          if (idx1+1 == idx2 && gaps[idx1+1] < g[2]) {
              gaps[idx1+1] = g[2];
          }
          // Same lane
          if (idx1 == idx2 && gaps[idx1] < g[2]) {
              gaps[idx1] = g[2];
          }
      }
  
      // Distribute the needed space between the lanes if there's not enough room
      // Second, evenly distribute multi-lane gaps
  
      for (let i = 0; i < gapMinSizeBetweenLanes.length; i++) {
          const g = gapMinSizeBetweenLanes[i];
  
          var idx1 = Math.min(g[0], g[1]);
          var idx2 = Math.max(g[0], g[1]);
  
          let totalGap = 0;
          for (let j = idx1; j < idx2; j++) {
              totalGap += gaps[j];
          }
  
          if (idx1+1 < idx2 && gaps[idx1+1] < g[2]) {
              let extraGap = (g[2] - totalGap) / (idx2 - idx1);
              if (extraGap > 0) {
                  for (let j = idx1; j < idx2; j++) {
                      gaps[j+1] += extraGap;
                  }
              }
          }
      }
  
      // Calculate ACTOR locations
  
      let actorOffsetX = gaps[0];
      for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          actor.lineX = actorOffsetX;
          actor.x = actor.lineX - actor.width / 2;
          actor.y = this.padding;
          actorOffsetX += gaps[i+1];
      }
  
      // Calculate EVENT locations
  
      let y = this.calculateEventPlacements(actorDict, events, 80, actorOffsetX);
  
      // Calculate ACTOR sizes
  
      for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          actor.lineY = y;
      }
  
      return { width: actorOffsetX, height: y };
    }
  
    calculateLaneGapsAndTextSize(actorDict, events) {
      let gapMinSizeBetweenLanes = [];
  
      for (let i = 0; i < events.length; i++) {
          const e = events[i];
          if (e.type == "signal") {
              let a1 = actorDict[e.src];
              let a2 = actorDict[e.dest];
              if (a1 && a2) {
                  const bbox = this.calculateTextDimensions(e.caption);
                  e.width = bbox.width;
                  e.height = bbox.height;
                  gapMinSizeBetweenLanes.push([a1[1], a2[1], bbox.width + 2 * this.padding]);
              }
          }
          else if (e.type == "note") {
              let a1 = actorDict[e.src];
              if (a1) {
                  const bbox = this.calculateTextDimensions(e.caption);
                  e.width = bbox.width + 2 * this.padding;
                  e.height = bbox.height + 2 * this.padding;
                  gapMinSizeBetweenLanes.push([a1[1], a1[1] + 1, e.width + 2 * this.padding]);
              }
          }
          else if (e.type == "alt") {
              for (let c = 0; c < e.cases.length; c++) {
                  const gaps = this.calculateLaneGapsAndTextSize(actorDict, e.cases[c].events);
                  gapMinSizeBetweenLanes = gapMinSizeBetweenLanes.concat(gaps);
              }
          }
      }
  
      return gapMinSizeBetweenLanes;
    }
  
    calculateEventPlacements(actorDict, events, startY, totalWidth) {
      let y = startY;
      for (let i = 0; i < events.length; i++) {
          const e = events[i];
          if (e.type == "signal") {
              let a1 = actorDict[e.src];
              let a2 = actorDict[e.dest];
              if (a1 && a2) {
                  e.startX = a1[0].lineX;
                  e.endX = a2[0].lineX;
                  e.startY = y;
                  e.endY = y;
                  y += 50;
              }
          }
          else if (e.type == "note") {
              let a1 = actorDict[e.src];
              if (a1) {
                  e.x = a1[0].lineX + 10;
                  e.y = y;
                  y += 20 + e.height;
              }
          }
          else if (e.type == "alt") {
              e.x = 0;
              e.y = y;
  
              y += 30;
  
              let altHeight = 20;
              for (let c = 0; c < e.cases.length; c++) {
                  let endY = this.calculateEventPlacements(actorDict, e.cases[c].events, y, totalWidth);
                  let caseHeight = endY - y;
                  e.cases[c].height = caseHeight;
                  altHeight += caseHeight;
                  y = endY;
              }
              e.height = altHeight;
              e.width = totalWidth;
  
              y += 10;
          }
      }
      return y;
    }
  
    renderSvgElements(actors, events, width, height) {
      const svgCanvas = this.createSvgElement("svg", { width, height });
      this.createArrowDefinitions(svgCanvas);
  
      for (let i = 0; i < actors.length; i++) {
          svgCanvas.appendChild(this.createParticipant(actors[i]));
      }
  
      this.renderSvgNestedEvents(svgCanvas, events);
  
      return new XMLSerializer().serializeToString(svgCanvas);
    }
  
    renderSvgNestedEvents(svgCanvas, events) {
      for (let i = 0; i < events.length; i++) {
          const e = events[i];
          if (e.type == "signal") {
              svgCanvas.appendChild(this.createArrow(e));
          }
          else if (e.type == "note") {
              svgCanvas.appendChild(this.createNoteBox(e));
          }
          else if (e.type == "alt") {
              svgCanvas.appendChild(this.createAltBox(e));
          }
      }
    }
  
    createSvgElement(type, attributes) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", type);
      for (const attr in attributes) {
          element.setAttribute(attr, attributes[attr]);
      }
      if (type === "text") {
          element.style.fontSize = "16px";
          element.style.fontFamily = "Arial";
          element.style.fill = this.color;
          element.style.stroke = this.colorBg;
          element.style["stroke-width"] = 4;
          element.style["paint-order"] = "stroke fill";
      }
      return element;
    }
  
    createArrowDefinitions(svgElement) {
      const defs = this.createSvgElement("defs", {});
      defs.appendChild(this.createArrowFromPath("arrowClosedRight", "M0,-5L10,0L0,5", this.color));
      defs.appendChild(this.createArrowFromPath("arrowOpenRight", "M0,-5L10,0M10,0L0,5", "none"));
      defs.appendChild(this.createArrowFromPath("arrowClosedLeft", "M10,-5L0,0L10,5", this.color));
      defs.appendChild(this.createArrowFromPath("arrowOpenLeft", "M10,-5L0,0M0,0L10,5", "none"));
      svgElement.appendChild(defs);
    }
  
    createArrowFromPath(id, pathD, fill) {
      const marker = this.createSvgElement("marker", {
          id: id,
          viewBox: "0 -5 10 10",
          refX: 5,
          refY: 0,
          markerWidth: 6,
          markerHeight: 6,
          orient: "auto"
      });
      const path = this.createSvgElement("path", {
          d: pathD,
          class: "arrowHead",
          fill: fill,
          stroke: this.color,
          "stroke-width": "2px"
      });
      marker.appendChild(path);
      return marker;
    }
  
    createText(x, y, content, textAnchor = "left", transform = null) {
      let textParams = {
          x, y,
          "text-anchor": "left",
          "dominant-baseline": "top",
          "text-anchor": textAnchor
      };
  
      if (transform !== null) {
          textParams["transform"] = transform;
      }
  
      const text = this.createSvgElement("text", textParams);
  
      let isFirst = true;
      const lines = content.split(/\n|\\n/);
      for (const line of lines) {
          const span = this.createSvgElement("tspan", { x, dy: isFirst ? "0" : "1em" });
          span.textContent = line;
          text.appendChild(span);
          isFirst = false;
      }
  
      return text;
    }
  
    createStickman(actor, padding) {
      let x = actor.lineX - 9;
      const group = this.createSvgElement("g", { width: 40, height: 40, "stroke-width": "2px" });
      const head = this.createSvgElement("circle", { cx: x + 10, cy: 10, r: 6, fill: "none", stroke: this.color });
      const body = this.createSvgElement("line", { x1: x + 10, y1: 16, x2: x + 10, y2: 28, stroke: this.color });
      const leftArm = this.createSvgElement("line", { x1: x + 10, y1: 24, x2: x + 2, y2: 20, stroke: this.color });
      const rightArm = this.createSvgElement("line", { x1: x + 10, y1: 24, x2: x + 18, y2: 20, stroke: this.color });
      const leftLeg = this.createSvgElement("line", { x1: x + 10, y1: 28, x2: x + 2, y2: 36, stroke: this.color });
      const rightLeg = this.createSvgElement("line", { x1: x + 10, y1: 28, x2: x + 18, y2: 36, stroke: this.color });
      group.appendChild(head);
      group.appendChild(body);
      group.appendChild(leftArm);
      group.appendChild(rightArm);
      group.appendChild(rightLeg);
      group.appendChild(leftLeg);
      return group;
    }
  
    createParticipant(actor) {
      let box = (actor.type == "actor")
          ? this.createStickman(actor)
          : this.createSvgElement("rect", {
              x: actor.x,
              y: actor.y,
              width: actor.width,
              height: actor.height,
              fill: "none",
              stroke: this.color,
              "stroke-width": "2px"
          });
  
      const line = this.createSvgElement("line", {
          x1: actor.lineX,
          y1: actor.y + actor.height,
          x2: actor.lineX,
          y2: actor.y + actor.lineY,
          stroke: this.color,
          "stroke-width": "1px"
      });
  
      const text = this.createText(actor.x + 10, actor.y + (actor.type == "actor" ? 42 : 23), actor.caption);
  
      const group = this.createSvgElement("g", {});
      group.appendChild(box);
      group.appendChild(line);
      group.appendChild(text);
      return group;
    }
  
    createAltBox(alt) {
      const width = 100 + 2 * this.padding;
      const height = 50 + 2 * this.padding;
  
      const box = this.createSvgElement("rect", {
          x: alt.x,
          y: alt.y,
          width: alt.width,
          height: alt.height,
          fill: "none",
          stroke: this.color,
          "stroke-width": "2px"
      });
  
      const typeBox = this.createSvgElement("path", {
          d: `
              M ${alt.x + 40} ${alt.y} 
              v 15 
              l -5 5 
              h -35
          `,
          fill: "none",
          stroke: this.color,
          "stroke-width": "2px"
      });
  
      const text = this.createText(alt.x + this.padding, alt.y + 15, alt.type);
  
      const group = this.createSvgElement("g", {});
      group.appendChild(typeBox);
      group.appendChild(box);
      group.appendChild(text);
  
      for (let i = 0, y = alt.y + 15; i < alt.cases.length; i++) {
          this.renderSvgNestedEvents(group, alt.cases[i].events);
  
          y += alt.cases[i].height;
          let divider = this.createSvgElement("line", {
              "stroke": this.color,
              "stroke-width": "2px",
              "stroke-dasharray": "4, 2",
              "x1": 0,
              "y1": y,
              "x2": alt.width,
              "y2": y
          });
          group.appendChild(divider);
      }
  
      return group;
    }
  
    createNoteBox(note) {
      const foldSize = 10;
  
      // Create the outline of the box
      const box = this.createSvgElement("path", {
          d: `
              M ${note.x} ${note.y} 
              h ${note.width - foldSize} 
              l ${foldSize} ${foldSize} 
              v ${note.height - foldSize} 
              h ${-note.width} 
              z
          `,
          fill: "none",
          stroke: this.color,
          "stroke-width": "2px"
      });
  
      // Create the folded corner
      const fold = this.createSvgElement("path", {
          d: `
              M ${note.x + note.width - foldSize},${note.y + 1}
              v ${foldSize - 1} 
              h ${foldSize - 1}
          `,
          fill: "none",
          stroke: this.color,
          "stroke-width": "2px"
      });
  
      // Create the folded shadow
      // const shadow = this.createSvgElement("path", {
      //     d: `
      //         M ${note.x + note.width - foldSize - 1},${note.y + 2}
      //         v ${foldSize - 1} 
      //         h ${foldSize - 1}
      //     `,
      //     fill: "none",
      //     stroke: "#bbb",
      //     "stroke-width": "2px"
      // });
  
      const text = this.createText(note.x + this.padding, note.y + 25, note.caption);
  
      const group = this.createSvgElement("g", {});
      //group.appendChild(shadow);
      group.appendChild(fold);
      group.appendChild(box);
      group.appendChild(text);
      return group;
    }
  
    createState(state) {
      const box = this.createSvgElement("rect", {
          x: state.x,
          y: state.y,
          rx: 10,
          ry: 10,
          width: state.width,
          height: state.height,
          fill: "none",
          stroke: this.color,
          "stroke-width": "2px"
      });
  
      const text = this.createText(state.x, state.y, state.caption);
  
      const group = this.createSvgElement("g", {});
      group.appendChild(box);
      group.appendChild(text);
      return group;
    }
  
    calculateTextDimensions(content) {
      const svg = this.createSvgElement("svg", { width: 600, height: 600 });
      const text = this.createText(0, 0, content);
      svg.appendChild(text);
  
      // Temporarily add the SVG element to the document
      document.body.appendChild(svg);
  
      const bbox = text.getBBox();
  
      // Remove the temporary SVG element from the document
      document.body.removeChild(svg);
  
      return bbox;
    }
  
    createArrow(signal) {
      const markerId = "arrow" + (signal.open ? "Open" : "Closed") + "Right";
  
      let attrs = {
          "stroke": this.color,
          "stroke-width": "2px",
          "marker-end": "url(#" + markerId + ")"
      };
  
      if (signal.dotted) {
          attrs["stroke-dasharray"] = "4, 2";
      }
  
      let line = null;
  
      if (signal.startX == signal.endX) {
          // Self-arrow
          attrs["fill"] = "none";
          attrs["d"] = `
              M ${signal.startX} ${signal.startY - 10}
              h ${signal.endY - signal.startY + 50} 
              a 10 10 0 0 1 10 10 
              v ${signal.endY - signal.startY + 1} 
              a 10 10 0 0 1 -10 10 
              h -44
          `;
          line = this.createSvgElement("path", attrs);
  
      } else {
          attrs["x1"] = signal.startX;
          attrs["y1"] = signal.startY + 10;
          attrs["x2"] = signal.endX + (signal.startX < signal.endX ? -7 : 7);
          attrs["y2"] = signal.endY + 10;
          line = this.createSvgElement("line", attrs);
      }
  
      const textX = (signal.startX + signal.endX) / 2;
      const text = this.createText(
          textX - (signal.startX == signal.endX ? 5 : 0),
          signal.startY,
          signal.caption,
          (signal.startX == signal.endX) ? "end" : "middle",
          `rotate(0 ${signal.startX} ${signal.startY})`
      );
  
      const group = this.createSvgElement("g", {});
      group.appendChild(line);
      group.appendChild(text);
      return group;
    }
}
