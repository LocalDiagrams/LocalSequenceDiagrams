// Copyright (c) 2024-2025 James Kilts

// Trivial stand-in for the browser DOM API for SVG elements,
// including a simple text size estimation function for SVG text elements.

type VirtualSvgElementAttributes = Record<string, string>;

// type VirtualSvgStyle = Record<string, string>;

const CHAR_WIDTH_RATIOS = {
    narrow: 0.3,
    normal: 0.6,
    wide: 0.8
};

const CHAR_TYPES = {
    narrow: new Set('ijl!|[]{}()./\'"`'),
    wide: new Set('wmWMQ%@')
};

export class VirtualSvgElement {
    public tagName: string;
    public attributes: VirtualSvgElementAttributes;
    public children: VirtualSvgElement[];
    public textContent: string;
    // private _style: VirtualSvgStyle;

    constructor(tagName: string) {
        this.tagName = tagName;
        this.attributes = {};
        this.children = [];
        this.textContent = '';
        // this._style = {};
    }

    estimateTextSize(text: string, fontSize: number, fontWeight: string) {
        const weightFactor = fontWeight === 'bold' ? 1.1 : 1.0;
        
        const width = text.split('').reduce((total, char) => {
            let ratio = CHAR_WIDTH_RATIOS.normal;
            if (CHAR_TYPES.narrow.has(char)) {ratio = CHAR_WIDTH_RATIOS.narrow;}
            if (CHAR_TYPES.wide.has(char)) {ratio = CHAR_WIDTH_RATIOS.wide;}
            return total + (fontSize * ratio * weightFactor);
        }, 0);

        return {
            width: width + (fontSize * 0.1),
            height: fontSize * 1.2
        };
    }

    getBBox() {
        if (this.tagName === 'text' || this.tagName === 'tspan') {
            const fontSize = parseFloat(this.getAttribute('font-size') || '16');
            const fontWeight = this.getAttribute('font-weight') || 'normal';
            const size = this.estimateTextSize(this.textContent, fontSize, fontWeight);
            
            return {
                x: 0,
                y: -fontSize * 0.85,
                width: size.width,
                height: size.height
            };
        }
        
        // Default bbox for non-text elements
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
    }

    setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] || null;
    }

    appendChild(child: VirtualSvgElement): void {
        this.children.push(child);
    }

    toString(): string {
        // const styleString = Object.entries(this._style)
        //     .map(([key, value]) => `${key}:${value}`)
        //     .join(';');

        const attributes = { ...this.attributes };
        // if (styleString) {
        //     attributes.style = styleString;
        // }

        const attrs = Object.entries(attributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
        
        const attrsString = attrs ? ' ' + attrs : '';
        
        if (this.children.length === 0 && !this.textContent) {
            return `<${this.tagName}${attrsString}/>`;
        }

        const childrenString = this.children
            .map(child => child.toString())
            .join('');

        return `<${this.tagName}${attrsString}>${childrenString}${this.textContent}</${this.tagName}>`;
    }
}

class VirtualBody {
    private elements: VirtualSvgElement[] = [];

    appendChild(element: VirtualSvgElement): void {
        this.elements.push(element);
    }

    removeChild(element: VirtualSvgElement): void {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            this.elements.splice(index, 1);
        }
    }
}

export class VirtualSvgDocument {
    public body: VirtualBody;

    constructor() {
        this.body = new VirtualBody();
    }

    createElementNS(_ns: string, tagName: string): VirtualSvgElement {
        return new VirtualSvgElement(tagName);
    }

    createElement(tagName: string): VirtualSvgElement {
        return new VirtualSvgElement(tagName);
    }
}
