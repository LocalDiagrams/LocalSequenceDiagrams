// Copyright (c) James Kilts
// Licensed under AGPL-3.0

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    // Stand-alone sequence diagram editor page

	const seqDiagramProvider = new SdEditorProvider(context);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'sequenceDiagramEditor',
            seqDiagramProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

	context.subscriptions.push(
        vscode.commands.registerCommand('extension.addDiagram', async () => {
            // tell the vscode ide to open a new untitled file in the format of a custom editor provider
            await vscode.workspace.openTextDocument({ language: 'sd', content: 'a->b: message' });
        })
    );

	context.subscriptions.push(
        vscode.commands.registerCommand('extension.addDiagramSnippet', async () => {
            vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`// <diagram>\r\n// </diagram`));
        })
    );

    // Watch for theme changes to update diagram rendering accordingly

    let currentTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('workbench.colorTheme')) {
            const newTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
            if (newTheme !== currentTheme) {
                currentTheme = newTheme;
                seqDiagramProvider.themeChanged();
            }
        }
    });

    // // Create and register inset provider
    // // NOTE: Inset is still in preview and is not allowed for published extensions
    // const insetProvider = new DiagramInsetProvider(context);
    // if (vscode.window.activeTextEditor) {
    //     // Initial update for active editor if one exists
    //     insetProvider.updateDiagrams();
    // }

    // Code lens provider for viewing diagrams
    const codeLensProvider = new DiagramCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('*', codeLensProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.viewDiagram', (diagramText: string) => {
            const panel = vscode.window.createWebviewPanel(
                'diagramViewer',
                'Sequence Diagram',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [context.extensionUri]
                }
            );

            panel.webview.html = getWebviewContent(context, panel.webview, diagramText);
        })
    );
}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview, content: string): string {
    const scriptSeqDiagramUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'local-sequence-diagrams.js'));
    const nonce = getNonce();    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: mediastream: blob: filesystem:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <title>Sequence Diagram</title>
    </head>
    <body>
        <textarea id="scriptContent">${content}</textarea>
        <div id="diagramTarget"></div>
        <script nonce="${nonce}" src="${scriptSeqDiagramUri}"></script>
        <script nonce="${nonce}">
            const inline = 1;
            console.log("HERE EXT");
            const target = document.getElementById("diagramTarget");
            const editor = document.getElementById('scriptContent');
            const seqDiagram = new LocalSequenceDiagrams("#fff","#000");
            const svg = seqDiagram.scriptToSvgImage(editor.value);
            target.appendChild(svg);
            editor.style.display = "none";
        </script>
    </body>
    </html>`;
}

class SdEditorProvider implements vscode.CustomTextEditorProvider {
	private _view?: vscode.WebviewPanel;

    constructor(private readonly context: vscode.ExtensionContext) {}

	public themeChanged() {
		if (this._view) {
			this._view.webview.postMessage({ type: 'themeChanged' });
		}
	}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {

		this._view = webviewPanel;

        webviewPanel.webview.options = {
            enableScripts: true,
        };

        webviewPanel.webview.html = this.getWebviewContent(document.getText(), webviewPanel.webview);

        const updateWebview = () => {
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
            });
        };

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'edit':
                        this.updateTextDocument(document, message.text);
                        return;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    private getWebviewContent(content: string, webview: vscode.Webview): string {
		const scriptSeqDiagramUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'local-sequence-diagrams.js'));
		const scriptResizableUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'resizable.js'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'main.js'));
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: mediastream: blob: filesystem:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

            <!--link href="${styleResetUri}" rel="stylesheet"-->
            <link href="${styleVSCodeUri}" rel="stylesheet">
            <link href="${styleMainUri}" rel="stylesheet">

            <title>SequenceDiagram</title>
        </head>
        <body>
            <textarea id="scriptContent" spellcheck="false">${content}</textarea>

            <div id="diagramTarget"></div>

            <script nonce="${nonce}" src="${scriptSeqDiagramUri}"></script>
            <script nonce="${nonce}" src="${scriptResizableUri}"></script>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private updateTextDocument(document: vscode.TextDocument, content: string): void {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            content
        );
        vscode.workspace.applyEdit(edit);
    }
}

export class DiagramCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const regex = /<diagram>([\s\S]*?)<\/diagram>/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const position = document.positionAt(match.index);
            const range = new vscode.Range(position, position);

            // since this will show up in comments, remove leading whitespace and forward slashes from each line of the diagram
            const diagramText = match[1].trim();
            const diagramTextLines = diagramText.split('\n').map(line => line.replace(/^[\s/]*/, ''));

            codeLenses.push(new vscode.CodeLens(range, {
                title: "🔍 View Diagram",
                command: 'extension.viewDiagram',
                arguments: [diagramTextLines.join('\n')]
            }));
        }

        return codeLenses;
    }
}

export class DiagramInsetProvider {
    private insets = new Map<string, vscode.WebviewEditorInset>();

    constructor(private readonly context: vscode.ExtensionContext) {
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
                //const endPos = document.positionAt(match.index + match[0].length);
                const diagramText = match[1].trim();

                const inset = vscode.window.createWebviewTextEditorInset(
                    editor,
                    startPos.line,
                    3, // height in lines
                    {
                        enableScripts: true,
                        localResourceRoots: [this.context.extensionUri]
                    }
                );

                inset.webview.html = this.getWebviewContent(inset.webview, diagramText);
                this.insets.set(`${document.uri.toString()}-${startPos.line}`, inset);
            }
        } catch (error) {
            console.log(error);
        }
    }

    private getWebviewContent(webview: vscode.Webview, diagramText: string): string {
		const scriptSeqDiagramUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'local-sequence-diagrams.js'));
		const nonce = getNonce();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: mediastream: blob: filesystem:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; script * data: mediastream: blob: filesystem:">
        </head>
        <body>
            <script nonce="${nonce}" src="${scriptSeqDiagramUri}"></script>
            
            <script nonce="${nonce}">
                const seqDiagram = new LocalSequenceDiagrams("#fff","#000");
                const svg = diagram.scriptToSvgText('${diagramText}');
                document.getElementById('diagramTarget').innerHTML = svg;
            </script>
        </body>
        </html>`;
    }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function deactivate() {}


//////////////
// NOTE: We might want to add an explorer section in the files view
    // "views": {
    //   "explorer": [
    //     {
    //       "type": "webview",
    //       "id": "extension.diagramsView",
    //       "name": "Sequence Diagrams"
    //     }
    //   ]
    // },



//////////////
// NOTE: We might want to add Thumbnail generation for a HoverProvider


    //private hiddenWebview: vscode.WebviewPanel;
    //constructor(private readonly context: vscode.ExtensionContext) {
        // this.hiddenWebview = vscode.window.createWebviewPanel(
        //     'diagramRenderer',
        //     'Hidden Diagram Renderer',
        //     { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
        //     { enableScripts: true, retainContextWhenHidden: true }
        // );
        // this.hiddenWebview.webview.html = this.getWebviewContent(this.hiddenWebview.webview);
        // Hide the webview panel
        //const webviewPanelIndex = -1;
        //(this.hiddenWebview as any)._panel.index = webviewPanelIndex;
        // Listen for diagram updates from webview
        // this.hiddenWebview.webview.onDidReceiveMessage(
        //     message => {
        //         if (message.command === 'diagramRendered') {
        //             this.updateDecoration(message.svg);   // <- update thumbnail
        //             //probably using this url:    vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
        //         }
        //     }
        // );



        // public updateDiagrams() {
                // // Send diagram content to hidden webview for rendering
                // this.hiddenWebview.webview.postMessage({
                //     command: 'render',
                //     diagramText: match[1].trim(),
                //     range: { start: startPos, end: endPos }
                // });



        // generate offscreen
        
        // private getWebviewContent(webview: vscode.Webview): string {
        // 	const scriptSeqDiagramUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'local-sequence-diagrams.js'));
        // 	const nonce = getNonce();
        //     return `<!DOCTYPE html>
        //     <html lang="en">
        //     <head>
        //         <meta charset="UTF-8">
        //         <meta name="viewport" content="width=device-width, initial-scale=1.0">
        //         <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: mediastream: blob: filesystem:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; script * data: mediastream: blob: filesystem:">
        //     </head>
        //     <body>
        //         <script nonce="${nonce}" src="${scriptSeqDiagramUri}"></script>
        //         <script nonce="${nonce}">
        //             const seqDiagram = new LocalSequenceDiagrams("#fff","#000");
        //             let vscode = acquireVsCodeApi();
        //             window.addEventListener('message', event => {
        //                 const message = event.data;
        //                 if (message.command === 'render') {
        //                     const svg = seqDiagram.scriptToSvgText(message.diagramText);
        //                     vscode.postMessage({
        //                         command: 'diagramRendered',
        //                         svg: svg
        //                     });
        //                 }
        //             });
        //         </script>
        //     </body>
        //     </html>`;
        // }