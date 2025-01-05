let vscode = acquireVsCodeApi();

const editor = document.getElementById('scriptContent');
const diagram = document.getElementById("diagramTarget");

makeResizable(editor, diagram);

editor.addEventListener('input', () => {
    vscode.postMessage({
        command: 'edit',
        text: editor.value
    });
});

window.addEventListener('message', event => {
    const message = event.data;

    if (message.type == 'update'){
        if (editor.value !== message.text) {
            editor.value = message.text;
        }
    }
    else if (message.type == 'themeChanged'){
        seqDiagram = getSequenceDiagrams();
        updateDiagram();
    }
    else if (message.command == 'load'){
        editor.value = message.content;
    }
});

function getSequenceDiagrams() {
    const el = document.getElementsByClassName("monaco-workbench")[0] || document.body;
    const c = getComputedStyle(el);
    return new LocalSequenceDiagrams(c.color, c.backgroundColor);
}

let seqDiagram = getSequenceDiagrams();

function updateDiagram() {
    diagram.innerHTML = "";  // clear the existing image (if present)
    diagram.appendChild(seqDiagram.scriptToSvgImage(editor.value));
}

editor.oninput = updateDiagram;
updateDiagram();
  