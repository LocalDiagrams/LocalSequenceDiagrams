import { VirtualSvgElement } from './virtual-svg-document';

export class VirtualSvgSerializer {
    serializeToString(element: VirtualSvgElement): string {
        if (!element) {
             return '';
        }

        const attrs = Object.entries(element.attributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        const attrsString = attrs ? ' ' + attrs : '';

        if (element.children.length === 0 && !element.textContent) {
            return `<${element.tagName}${attrsString}/>`;
        }

        const childrenString = element.children
            .map(child => this.serializeToString(child))
            .join('');

        return `<${element.tagName}${attrsString}>${childrenString}${element.textContent}</${element.tagName}>`;
    }
}