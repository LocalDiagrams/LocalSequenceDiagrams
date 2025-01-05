# vscode-sd-extension

This is a Visual Studio Code extension that allows users to render and edit `.sd` files as a webpage. The extension provides an intuitive interface for modifying the content of these files directly within VS Code.

## Features

- Renders `.sd` files in a webview.
- Includes an edit box for modifying file content.
- Supports saving changes back to the original `.sd` file.

## Installation

1. Use NVM to prepare NodeJS (if not already installed)
   ```
   nvm install lts
   nvm use lts
   ```
2. Navigate to the project directory:
   ```
   cd vscode-sd-extension
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Run the extension:
   ```
   npm run watch
   ```

## Usage

1. Open a `.sd` file in Visual Studio Code.
2. Use the command palette (Ctrl+Shift+P) and type `Create Sequence Diagram`.
3. The file will be rendered in a webview with an edit box.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.