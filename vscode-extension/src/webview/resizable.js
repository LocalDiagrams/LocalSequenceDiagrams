// Copyright (c) James Kilts
// Licensed under AGPL-3.0

// Make two div elements resizable by adding a vertical splitter between them
// NOTE: This extremely simple horizontal pane resize implementation assumes
//       that the divs will be absolutely positioned with the second div on the
//       right having a css style "right: 0" to avoid calculating the width.

function makeResizable(div1, div2) {

    // Create a splitter div and append it directly to the document body
    let splitter = document.createElement("div");
    splitter.className = "splitter";
    document.body.appendChild(splitter);
  
    // Set the initial position and styles of the splitter
    splitter.style.position = "absolute";
    splitter.style.width = "10px";
    splitter.style.left = div2.offsetLeft + "px";
    splitter.style.top = "0"; //div1.offsetTop + "px";
    splitter.style.height = div1.offsetHeight + "px";
    splitter.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
  
    // Splitter move beginning
    function startResize(e) {
      e.preventDefault();
  
      // Set a flag to indicate that the splitter is being dragged
      // and store the initial mouse/touch and splitter positions
      splitter.resizeInProgress = true;
      splitter.startMouseClientX = e.clientX || e.touches[0].clientX;
      splitter.startLeft = parseInt(splitter.style.left, 10);
    }
    splitter.addEventListener("mousedown", startResize);
    splitter.addEventListener("touchstart", startResize);
  
    // Splitter move event
    function moveResize(e) {
      if (splitter.resizeInProgress) {
  
        // Calculate the new position of the splitter based on the mouse/touch movement
        let delta = (e.clientX || e.touches[0].clientX) - splitter.startMouseClientX;
        let newLeft = splitter.startLeft + delta;
        let widthCorrection = e.clientX ? -10 : 0;
  
        // Update the style of the splitter and the divs
        splitter.style.left = newLeft + "px";
        div1.style.width = (newLeft - div1.offsetLeft + widthCorrection) + "px";
        div2.style.left = newLeft + "px";
      }
    }
    document.body.addEventListener("mousemove", moveResize);
    document.body.addEventListener("touchmove", moveResize);
  
    // Splitter move complete
    function endResize(e) {
      // Reset the flags if the splitter was actively being moved
      if (splitter.resizeInProgress) {
        splitter.resizeInProgress = false;
        splitter.startMouseClientX = null;
        splitter.startLeft = null;
      }
    }
    document.body.addEventListener("mouseup", endResize);
    document.body.addEventListener("touchend", endResize);
}
