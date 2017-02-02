'use strict';

const log = require('./log');

module.exports = class FieldPattern {
  static formatAll(obj, fields) {
    if (typeof obj === 'string') {
      return new FieldPattern(obj).format(fields);
    }
    else if (Array.isArray(obj)) {
      return obj.map((c) => this.formatAll(c, fields));
    }
    else if (obj && typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.formatAll(obj[key], fields);
      }
      return result;
    }
    return obj;
  }

  constructor(pattern, initialValues = null) {
    this.fieldRegex = /{[\w\.\-]+}/g;
    this.pattern = pattern;
    if (initialValues) {
      this.pattern = { type: this.type, value: this.format(initialValues) };
    }
  }

  get pattern() {
    return this.patternVal;
  }

  set pattern(patternVal) {
    if (typeof patternVal === 'string') {
      this.type = 'string';
      this.patternStr = patternVal;
    }
    else {
      this.type = patternVal.type || 'string';
      this.patternStr = patternVal.value;
    }
    const match = this.patternStr.match(this.fieldRegex);
    if (match) {
      this.fields = match.map((f) => f.substr(1, f.length - 2));
    }
    else {
      this.fields = [];
    }
    const bareStr = this.patternStr.replace(this.fieldRegex, 'TEMPLATE_FIELD');
    const escaped = bareStr.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    const regexStr = escaped.replace(/TEMPLATE_FIELD/g, '([^/]+)');
    this.regex = new RegExp(`^${regexStr}$`);
    this.patternVal = patternVal;
    return patternVal;
  }

  match(str) {
    const match = str.match(this.regex);
    if (!match) return null;
    const result = {};
    match.shift();
    for (let i = 0; i < this.fields.length; i++) {
      result[this.fields[i]] = match[i];
    }
    return result;
  }

  format(values) {
    let result = this.patternStr;
    for (const field of this.fields) {
      const keypath = field.split('.');
      let nestedValue = values;
      while (keypath.length > 0 && nestedValue) {
        nestedValue = nestedValue[keypath.shift()];
      }
      if (nestedValue) {
        result = result.replace(`{${field}}`, nestedValue);
      }
    }
    return this.stringToValue(result);
  }

  isComplete(str) {
    return !str.match(this.fieldRegex);
  }

  stringToValue(str) {
    if (!str || this.type === 'string' || !this.isComplete(str)) {
      return str;
    }
    else if (this.type === 'date') {
      return this.parseDate(str);
    }
    return str;
  }

  parseDate(date) {
    let isoDateTime = null;
    if (date.match(/^\d{7}$/)) {
      const match = date.match(/^(\d{4})(\d{3})$/);
      const year = match[1];
      const doy = match[2];
      const datetime = new Date(+new Date(`${year}-01-01Z`) + (24 * 60 * 60 * 1000 * (doy - 1)));
      isoDateTime = datetime.toISOString();
    }
    else if (date.match(/^\d{4}-\d{2}-\d{2}T/)) {
      isoDateTime = date;
    }

    if (isoDateTime === null) {
      log.warn(`Unable to parse date: ${date}`);
      return date;
    }

    const isoDate = isoDateTime.split('T')[0];
    const [year, month, day] = isoDate.split('-');

    return {
      isoDate: isoDate,
      isoDateTime: isoDateTime,
      day: day,
      month: month,
      year: year
    };
  }
};
