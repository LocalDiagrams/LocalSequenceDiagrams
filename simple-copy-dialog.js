const copyDialog = document.querySelector('#copyDialog');

document.querySelector('#copyButton').addEventListener('click', () => {
  copyDialog.showModal();
});

document.querySelector('#copyDialogCloseBtn').addEventListener('click', () => {
  copyDialog.close();
});

document.querySelector('#copyDialogPngBtn').addEventListener('click', () => {
    const script = s.value;
    const svgImage = seqDiagram.scriptToSvgImage(script);

    // Temporarily add a drawing canvas to the document
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    canvas.width = svgImage.width;
    canvas.height = svgImage.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(svgImage, 0, 0);

    canvas.toBlob(b =>
        navigator.clipboard.write([
            new ClipboardItem({'image/png': b}),
        ]).then(x => {
            copyDialog.close();
            alert('Copied!');
        }),
        'image/png');

    // Remove the temporary canvas from the document
    document.body.removeChild(canvas);
});

document.querySelector('#copyDialogSvgBtn').addEventListener('click', () => {
    const script = s.value;
    const svgString = seqDiagram.scriptToSvgText(script);

    navigator.clipboard.writeText(svgString).then(x => {
        copyDialog.close();
        alert('Copied!');
    });
});

document.querySelector('#copyDialogTextBtn').addEventListener('click', () => {
    const script = s.value;

    navigator.clipboard.writeText(script).then(x => {
        copyDialog.close();
        alert('Copied!');
    });
});
