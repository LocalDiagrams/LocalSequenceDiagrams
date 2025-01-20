// Copyright (c) James Kilts
// Licensed under AGPL-3.0

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
// <sequence>
// ╔═════════╗
// ║  Start  ║
// ╚═══╤═════╝
//     │  Closed arrow
//     │────────────────│
//     │  Open arrow
//     │────────────────>│
//     │
//     │
//
// ## localdiagrams.github.io ##
//
// Start -> End: Closed arrow
// Start -> End: Open arrow
// </sequence>
//
// The process of placing the elements augments those data structures with information
// about size and location.  While the vertical placement is rather straight-forward,
// the majority of the placement logic calculates the "gaps" between the participant
// swim-lanes, mainly due to events that occupy the gap.
//
// Since size and location are preserved during placement, the rendering stage can focus
// on the output-specific format, namely SVG.

class LocalSequenceDiagrams {
    constructor(doc = null, serializer = null, colorForeground = "#000", colorBackground = "#fff") {
        this.doc = doc || document;
        this.serializer = serializer || new XMLSerializer();
        this.color = colorForeground;
        this.colorBg = colorBackground;
    }

    scriptToSvgImage(script) {
        const svgString = this.scriptToSvgText(script);
        const svgImage = new Image();
        svgImage.src = "data:image/svg+xml," + encodeURIComponent(svgString);
        return svgImage;
    }

    scriptToSvgText(script) {
        const sizes = {
            padding: 10,
            signalMargin: 50,
            noteMarginX: 10,
            noteMarginY: 20,
            noteTextMarginX: 10,
            noteTextMarginY: 25,
            altMinHeight: 20,
            altMarginBottom: 10,
            altMarginItems: 30,
            actorStickmanHeight: 10,
            calculateTextDimensions: this.calculateTextDimensionsSvg.bind(this)
        };
        const { actors, events } = this.parseScriptToArrays(script);
        const { width, height } = this.calculatePlacements(actors, events, sizes);
        return this.renderSvgElements(actors, events, width, height, sizes);
    }

    scriptToAsciiArt(script) {
        const sizes = {
            padding: 1,
            signalMargin: 2,
            noteMarginX: 1,
            noteMarginY: 1,
            noteTextMarginX: 1,
            noteTextMarginY: 1,
            altMinHeight: 1,
            altMarginBottom: 1,
            altMarginItems: 1,
            actorStickmanHeight: 1,
            calculateTextDimensions: this.calculateTextDimensionsAscii.bind(this)
        };
        const { actors, events } = this.parseScriptToArrays(script);
        const { width, height } = this.calculatePlacements(actors, events, sizes);
        return this.renderAsciiElements(actors, events, width, height);
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

    // Utilities

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

    // Calculations

    calculatePlacements(actors, events, sizes) {
        const actorDict = actors.reduce((dict, val, idx) => { dict[val.caption] = [val, idx]; return dict; }, {});
        const gaps = Array.from({ length: actors.length + 1 }, () => 0);

        // Calculate ACTOR gaps and widths

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            const bbox = sizes.calculateTextDimensions(actor.caption);
            const extraHeight = (actor.type === "actor") ? sizes.actorStickmanHeight : 0;

            actor.height = bbox.height + 2 * sizes.padding + extraHeight;
            actor.width = bbox.width + 2 * sizes.padding;

            gaps[i] += (actor.width / 2) + sizes.padding;
            gaps[i+1] += (actor.width / 2) + sizes.padding;
        }

        // Calculate EVENT gaps and widths
        // (Notes and signal captions can affect actor placement)

        let gapMinSizeBetweenLanes = this.calculateLaneGapsAndTextSize(actorDict, events, sizes);

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
        let actorMaxHeight = 0;
        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            actor.lineX = actorOffsetX;
            actor.x = actor.lineX - actor.width / 2;
            actor.y = sizes.padding;
            actorMaxHeight = Math.max(actorMaxHeight, actor.height);
            actorOffsetX += gaps[i+1];
        }

        // Calculate EVENT locations

        let y = this.calculateEventPlacements(actorDict, events, actorMaxHeight + sizes.padding * 2 + 1, actorOffsetX, sizes);

        // Calculate ACTOR sizes

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            actor.lineY = y;
        }

        return { width: actorOffsetX, height: y };
    }

    calculateLaneGapsAndTextSize(actorDict, events, sizes) {
        let gapMinSizeBetweenLanes = [];

        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            if (e.type == "signal") {
                let a1 = actorDict[e.src];
                let a2 = actorDict[e.dest];
                if (a1 && a2) {
                    const bbox = sizes.calculateTextDimensions(e.caption);
                    e.width = bbox.width;
                    e.height = bbox.height;
                    gapMinSizeBetweenLanes.push([a1[1], a2[1], bbox.width + 2 * sizes.padding]);
                }
            }
            else if (e.type == "note") {
                let a1 = actorDict[e.src];
                if (a1) {
                    const bbox = sizes.calculateTextDimensions(e.caption);
                    e.width = bbox.width + 2 * sizes.padding;
                    e.height = bbox.height + 2 * sizes.padding;
                    gapMinSizeBetweenLanes.push([a1[1], a1[1] + 1, e.width + 2 * sizes.padding]);
                }
            }
            else if (e.type == "alt") {
                for (let c = 0; c < e.cases.length; c++) {
                    const gaps = this.calculateLaneGapsAndTextSize(actorDict, e.cases[c].events, sizes);
                    gapMinSizeBetweenLanes = gapMinSizeBetweenLanes.concat(gaps);
                }
            }
        }

        return gapMinSizeBetweenLanes;
    }

    calculateEventPlacements(actorDict, events, startY, totalWidth, sizes) {
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
                    y += sizes.signalMargin + e.height;
                }
            }
            else if (e.type == "note") {
                let a1 = actorDict[e.src];
                if (a1) {
                    e.x = a1[0].lineX + sizes.noteMarginX;
                    e.y = y;
                    e.textMarginX = sizes.noteTextMarginX;
                    e.textMarginY = sizes.noteTextMarginY;
                    y += sizes.noteMarginY + e.height;
                }
            }
            else if (e.type == "alt") {
                e.x = 0;
                e.y = y;

                y += sizes.altMarginItems;

                let altHeight = sizes.altMinHeight;
                for (let c = 0; c < e.cases.length; c++) {
                    let endY = this.calculateEventPlacements(actorDict, e.cases[c].events, y, totalWidth, sizes);
                    let caseHeight = endY - y;
                    e.cases[c].height = caseHeight;
                    altHeight += caseHeight;
                    y = endY;
                }
                e.height = altHeight;
                e.width = totalWidth;

                y += sizes.altMarginBottom;
            }
        }
        return y;
    }

    // SVG CALCULATE TEXT SIZE

    calculateTextDimensionsSvg(content) {
        const svg = this.createSvgElement("svg", { width: 600, height: 600 });
        const text = this.drawSvgText(0, 0, content);
        svg.appendChild(text);

        // Temporarily add the SVG element to the document
        this.doc.body.appendChild(svg);

        const bbox = text.getBBox();

        // Remove the temporary SVG element from the document
        this.doc.body.removeChild(svg);

        return bbox;
    }

    // SVG RENDERING

    renderSvgElements(actors, events, width, height, sizes) {
        const svgCanvas = this.createSvgElement("svg", { width, height });
        this.createArrowDefinitions(svgCanvas);

        for (let i = 0; i < actors.length; i++) {
            svgCanvas.appendChild(this.drawSvgParticipant(actors[i], sizes));
        }

        this.renderSvgNestedEvents(svgCanvas, events, sizes);

        return this.serializer.serializeToString(svgCanvas);
    }

    renderSvgNestedEvents(svgCanvas, events, sizes) {
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            if (e.type == "signal") {
                svgCanvas.appendChild(this.drawSvgArrow(e, sizes));
            }
            else if (e.type == "note") {
                svgCanvas.appendChild(this.drawSvgNoteBox(e, sizes));
            }
            else if (e.type == "alt") {
                svgCanvas.appendChild(this.drawSvgAltBox(e, sizes));
            }
        }
    }

    createSvgElement(type, attributes) {
        const element = this.doc.createElementNS("http://www.w3.org/2000/svg", type);
        for (const attr in attributes) {
            element.setAttribute(attr, attributes[attr]);
        }
        if (type === "text") {
            element.setAttribute("style", `font-size: 16px; font-family: Arial; fill: ${this.color}; stroke: ${this.colorBg}; stroke-width: 4; paint-order: stroke fill;`);
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

    drawSvgText(x, y, content, textAnchor = "left", transform = null) {
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

    drawSvgStickman(actor, sizes) {
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

    drawSvgParticipant(actor, sizes) {
        let box = (actor.type == "actor")
            ? this.drawSvgStickman(actor, sizes)
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

        const text = this.drawSvgText(actor.x + 10, actor.y + (actor.type == "actor" ? 42 : 23), actor.caption);

        const group = this.createSvgElement("g", {});
        group.appendChild(box);
        group.appendChild(line);
        group.appendChild(text);
        return group;
    }

    drawSvgAltBox(alt, sizes) {
        const width = 100 + 2 * sizes.padding;
        const height = 50 + 2 * sizes.padding;

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

        const text = this.drawSvgText(alt.x + sizes.padding, alt.y + 15, alt.type);

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

    drawSvgNoteBox(note, sizes) {
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

        const text = this.drawSvgText(note.x + note.textMarginX, note.y + note.textMarginY, note.caption);

        const group = this.createSvgElement("g", {});
        //group.appendChild(shadow);
        group.appendChild(fold);
        group.appendChild(box);
        group.appendChild(text);
        return group;
    }

    // createState(state) {
    //     const box = this.createSvgElement("rect", {
    //         x: state.x,
    //         y: state.y,
    //         rx: 10,
    //         ry: 10,
    //         width: state.width,
    //         height: state.height,
    //         fill: "none",
    //         stroke: this.color,
    //         "stroke-width": "2px"
    //     });

    //     const text = this.createText(state.x, state.y, state.caption);

    //     const group = this.createSvgElement("g", {});
    //     group.appendChild(box);
    //     group.appendChild(text);
    //     return group;
    // }

    drawSvgArrow(signal, sizes) {
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
        const text = this.drawSvgText(
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

    // ASCII ART CALCULATE TEXT SIZE

    calculateTextDimensionsAscii(content) {
        // get height from number of newlines in the content
        // get width from the longest line in the content
        const bbox = {
            height: content.split(/\n|\\n/).length,
            width: Math.max(...content.split(/\n|\\n/).map(line => line.length))
        };

        return bbox;
    }

    // ASCII ART RENDERING

    renderAsciiElements(actors, events, width, height) {
        let asciiArt = Array.from({ length: height + 2 }, () => Array(Math.ceil(width)).fill(' '));

        // Render actors
        for (let i = 0; i < actors.length; i++) {
            this.drawAsciiParticipant(asciiArt, actors[i]);
        }

        // Render events
        this.renderAsciiNestedEvents(asciiArt, events);

        return asciiArt
            .map(row => row.join(''))
            .join('\n');
    }

    renderAsciiNestedEvents(asciiArt, events) {
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            if (e.type == "signal") {
                this.drawAsciiArrow(asciiArt, e);
            } else if (e.type == "note") {
                this.drawAsciiNoteBox(asciiArt, e);
            } else if (e.type == "alt") {
                this.drawAsciiAltBox(asciiArt, e);
            }
        }
    }

    drawAsciiText(asciiArt, text, startX, startY) {
        let x = Math.floor(startX);
        let y = Math.floor(startY);

        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                x = startX;
                y++;
            }
            else if (text[i] === '\\' && text[i+1] === 'n') {
                i++;
                x = startX;
                y++;
            }
            else {
                asciiArt[y][x] = text[i];
                x++;
            }
        }
    }

    drawAsciiParticipant(asciiArt, actor) {
        const x = Math.floor(actor.x);
        const y = Math.floor(actor.y);
        const width = Math.floor(actor.width);
        const height = Math.floor(actor.height);
        const lineX = Math.floor(actor.lineX);

        if (actor.type === "actor") {
            // Draw stickman
            asciiArt[y][lineX - 2] = '.';
            asciiArt[y][lineX - 1] = '_';
            asciiArt[y][lineX] = 'O';
            asciiArt[y][lineX + 1] = '_';
            asciiArt[y][lineX + 2] = '.';
            asciiArt[y + 1][lineX] = '|';
            asciiArt[y + 2][lineX - 1] = '/';
            asciiArt[y + 2][lineX + 1] = '\\';

            // Draw caption under the stickman
            this.drawAsciiText(asciiArt, actor.caption, x+2, y+3);
        } else {
            // Draw box
            for (let i = 1; i < width - 1; i++) {
                asciiArt[y][x + i] = '═';
                asciiArt[y + height - 1][x + i] = (lineX == x + i) ? '╤' : '═';
            }
            for (let i = 1; i < height - 1; i++) {
                asciiArt[y + i][x] = '║';
                asciiArt[y + i][x + width - 1] = '║';
            }
            asciiArt[y][x] = '╔';
            asciiArt[y][x + width - 1] = '╗';
            asciiArt[y + height - 1][x] = '╚';
            asciiArt[y + height - 1][x + width - 1] = '╝';

            // Draw caption
            this.drawAsciiText(asciiArt, actor.caption, x+1, y+1);
        }

        // Draw swimlane line
        for (let i = actor.height; i <= actor.lineY; i++) {
            asciiArt[y + i][lineX] = '│';
        }
    }

    drawAsciiArrow(asciiArt, signal) {
        const startX = Math.floor(signal.startX);
        const endX = Math.floor(signal.endX);
        const y = Math.floor(signal.startY);
        const direction = (startX < endX) ? 1 : -1;
        const textStartX = (startX == endX)
            ? startX - Math.floor(signal.width)
            : Math.floor((signal.startX + signal.endX) / 2) - Math.floor(signal.caption.length / 2);

        // Draw arrow line
        if (signal.startX == signal.endX) {
            // Self-arrow
            asciiArt[y-1][startX+1] = '─';
            asciiArt[y-1][startX+2] = '─';
            asciiArt[y-1][startX+3] = '┐';
            asciiArt[y][startX+3] = '┘';
            asciiArt[y][startX+2] = '─';

        } else {
            for (let x = Math.min(startX, endX)+1; x < Math.max(startX, endX); x++) {
                asciiArt[y][x] = '─';
            }
        }

        // Draw arrow head
        if (direction > 0)
            asciiArt[y][endX - 1] = signal.open ? '>' : '►';
        else
            asciiArt[y][endX + 1] = signal.open ? '<' : '◄';

        // Draw caption
        this.drawAsciiText(asciiArt, signal.caption, textStartX, y-1);
    }

    drawAsciiNoteBox(asciiArt, note) {
        const x = Math.floor(note.x);
        const y = Math.floor(note.y);
        const width = Math.floor(note.width);
        const height = Math.floor(note.height);

        // Draw box sides
        for (let i = 1; i < width - 1; i++) {
            asciiArt[y][x + i] = '═';
            asciiArt[y + height - 1][x + i] = '═';
        }
        for (let i = 1; i < height - 1; i++) {
            asciiArt[y + i][x] = '║';
            asciiArt[y + i][x + width - 1] = '║';
        }

        // Draw box corners
        asciiArt[y][x] = '╔';
        asciiArt[y][x + width - 1] = '·';  // would be nice to use lower-left triangle '◺' but it's not monospaced  ¯\_(ツ)_/¯
        asciiArt[y + height - 1][x] = '╚';
        asciiArt[y + height - 1][x + width - 1] = '╝';

        // Draw caption
        this.drawAsciiText(asciiArt, note.caption, x + 1, y + 1);
    }

    drawAsciiAltBox(asciiArt, alt) {
        const x = Math.floor(alt.x);
        const y = Math.floor(alt.y);
        const width = Math.floor(alt.width);
        const height = Math.floor(alt.height);

        // Draw box
        for (let i = 1; i < width - 1; i++) {
            asciiArt[y][x + i] = '═';
            asciiArt[y + height - 1][x + i] = '═';
            // draw intersections with swimlanes with ╪?
        }
        for (let i = 1; i < height - 1; i++) {
            asciiArt[y + i][x] = '║';
            asciiArt[y + i][x + width - 1] = '║';
        }
        asciiArt[y][x] = '╔';
        asciiArt[y][x + width - 1] = '╗';
        asciiArt[y + height - 1][x] = '╚';
        asciiArt[y + height - 1][x + width - 1] = '╝';

        asciiArt[y][x+6] = '╤';
        asciiArt[y+1][x+6] = '│';
        asciiArt[y+2][x] = '╟';
        asciiArt[y+2][x+1] = '─';
        asciiArt[y+2][x+2] = '─';
        asciiArt[y+2][x+3] = '─';
        asciiArt[y+2][x+4] = '─';
        asciiArt[y+2][x+5] = '─';
        asciiArt[y+2][x+6] = '╯';

        // Draw "Alt" label
        this.drawAsciiText(asciiArt, `Alt`, x + 2, y + 1);

        // Draw cases
        let currentY = y + 1;
        for (let i = 0; i < alt.cases.length; i++) {
            const textStartX = Math.floor(alt.x + alt.width/2 - alt.cases[i].caption.length/2);
            if (i > 0) {
                for (let w = 1; w < width-1; w++) {
                    asciiArt[currentY][x+w] = '┈';
                    // draw intersections with swimlanes with  ┼ ?
                }
            }
            this.drawAsciiText(asciiArt, `[${alt.cases[i].caption}]`, textStartX, currentY+1);
            this.renderAsciiNestedEvents(asciiArt, alt.cases[i].events);
            currentY += alt.cases[i].height;
        }
    }
}
