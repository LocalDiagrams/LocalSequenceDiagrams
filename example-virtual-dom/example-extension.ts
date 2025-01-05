
// NOTE: This approach of using a decoration provider does not work with
//       VSCode production releases, however the idea illustrates how
//       to use a decoration provider to render SVG content in the editor
//       without a hidden browser.

import * as vscode from 'vscode';
import { VirtualSvgDocument } from './virtual-svg-document';
import { VirtualSvgSerializer } from './virtual-svg-serializer';
import LocalSequenceDiagrams from './local-sequence-diagrams';

export function activate(context: vscode.ExtensionContext) {

    // Create and register decoration provider
    const decorationProvider = new DiagramDecorationProvider(context);

    if (vscode.window.activeTextEditor) {
        // Initial update for active editor if one exists
        decorationProvider.updateDiagrams();
    }
}

export class DiagramDecorationProvider {
    private decorationType: vscode.TextEditorDecorationType;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: '',
                height: '200px',
                width: '100%'
            }
        });

        // Watch for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateDiagrams();
        });

        // Watch for document changes
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                this.updateDiagrams();
            }
        });
    }

    public updateDiagrams() {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const document = editor.document;
            const text = document.getText();

            // Find diagram tags in comments without using regex
            const regex = /<diagram>([\s\S]*?)<\/diagram>/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const diagramText = match[1].trim();

                const seqDiagram = new LocalSequenceDiagrams(
                    new VirtualSvgDocument(),
                    new VirtualSvgSerializer(),
                    "#fff", "#000");

                let svg = seqDiagram.scriptToSvgText(diagramText);

                // Add SVG namespace if missing
                if (!svg.includes('xmlns=')) {
                    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
                }

                // Ensure SVG has width/height
                if (!svg.includes('width=')) {
                    svg = svg.replace('<svg', '<svg width="100%" height="100%"');
                }

                const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

                editor.setDecorations(this.decorationType, [{
                    range: new vscode.Range(startPos, endPos),
                    renderOptions: {
                        before: {
                            contentText: '',
                            height: '200px',
                            width: '100%',
                            backgroundColor: 'transparent',
                            contentIconPath: vscode.Uri.parse(dataUrl)
                        }
                    }
                }]);
            }
        } catch (error) {
            console.log(error);
        }
    }

    private updateDecoration(svg: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}
        editor.setDecorations(this.decorationType, [{
            range: new vscode.Range(0, 0, 0, 0),
            renderOptions: {
                before: {
                    contentText: '',
                    height: '200px',
                    width: '100%',
                    backgroundColor: 'transparent',
                    contentIconPath: vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
                }
            }
        }]);
    }
}

export function deactivate() {}