import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sgSearchTerms'
})
export class SearchTermsPipe implements PipeTransform {

  transform(value: string, searchTerms: string[]): any {
    if (searchTerms.length === 0) {
      return value;
    }
    const regE = searchTerms.map(this.escapeRegExp).reduce((a, b) => `${a}|${b}`);
    const reg = RegExp(regE, 'gi');
    return value.replace(reg, sub => `<span class="accent">${sub}</span>`);
  }

  escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }

}
