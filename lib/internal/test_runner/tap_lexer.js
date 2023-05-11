'use strict';

const {
  ArrayPrototypePop,
  ArrayPrototypePush,
  MathMax,
  SafeSet,
  StringPrototypeCodePointAt,
  StringPrototypeTrim,
} = primordials;
const {
  codes: { ERR_TAP_LEXER_ERROR },
} = require('internal/errors');

const { isZeroWidthCodePoint } = require('internal/util/inspect');

const kEOL = '';
const kEOF = '';

const TokenKind = {
  EOF: 'EOF',
  EOL: 'EOL',
  NEWLINE: 'NewLine',
  NUMERIC: 'Numeric',
  LITERAL: 'Literal',
  KEYWORD: 'Keyword',
  WHITESPACE: 'Whitespace',
  COMMENT: 'Comment',
  DASH: 'Dash',
  PLUS: 'Plus',
  HASH: 'Hash',
  ESCAPE: 'Escape',
  UNKNOWN: 'Unknown',

  // TAP tokens
  TAP: 'TAPKeyword',
  TAP_VERSION: 'VersionKeyword',
  TAP_PLAN: 'PlanKeyword',
  TAP_TEST_POINT: 'TestPointKeyword',
  TAP_SUBTEST_POINT: 'SubTestPointKeyword',
  TAP_TEST_OK: 'TestOkKeyword',
  TAP_TEST_NOTOK: 'TestNotOkKeyword',
  TAP_YAML_START: 'YamlStartKeyword',
  TAP_YAML_END: 'YamlEndKeyword',
  TAP_YAML_BLOCK: 'YamlKeyword',
  TAP_PRAGMA: 'PragmaKeyword',
  TAP_BAIL_OUT: 'BailOutKeyword',
};

class Token {
  constructor({ kind, value, stream }) {
    const valueLength = ('' + value).length;
    this.kind = kind;
    this.value = value;
    this.location = {
      line: stream.line,
      column: MathMax(stream.column - valueLength + 1, 1), // 1 based
      start: MathMax(stream.pos - valueLength, 0), // zero based
      end: stream.pos - (value === '' ? 0 : 1), // zero based
    };

    // EOF is a special case
    if (value === TokenKind.EOF) {
      const eofPosition = stream.input.length + 1; // We consider EOF to be outside the stream
      this.location.start = eofPosition;
      this.location.end = eofPosition;
      this.location.column = stream.column + 1; // 1 based
    }
  }
}

class InputStream {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.column = 0;
    this.line = 1;
  }

  eof() {
    return this.peek() === undefined;
  }

  peek(offset = 0) {
    return this.input[this.pos + offset];
  }

  next() {
    const char = this.peek();
    if (char === undefined) {
      return undefined;
    }

    this.pos++;
    this.column++;
    if (char === '\n') {
      this.line++;
      this.column = 0;
    }

    return char;
  }
}

class TapLexer {
  static Keywords = new SafeSet([
    'TAP',
    'version',
    'ok',
    'not',
    '...',
    '---',
    '..',
    'pragma',
    '-',
    '+',

    // NOTE: "Skip", "Todo" and "Bail out!" literals are deferred to the parser
  ]);

  #isComment = false;
  #source = null;
  #line = 1;
  #column = 0;
  #escapeStack = [];
  #lastScannedToken = null;

  constructor(source) {
    this.#source = new InputStream(source);
    this.#lastScannedToken = new Token({
      kind: TokenKind.EOL,
      value: kEOL,
      stream: this.#source,
    });
  }

  scan() {
    const tokens = [];
    let chunk = [];
    while (!this.eof()) {
      const token = this.#scanToken();

      // Remember the last scanned token (except for whitespace)
      if (token.kind !== TokenKind.WHITESPACE) {
        this.#lastScannedToken = token;
      }

      ArrayPrototypePush(chunk, token);
      if (token.kind === TokenKind.NEWLINE) {
        // Store the current chunk + NEWLINE token
        ArrayPrototypePush(tokens, chunk);
        chunk = [];
      }
    }

    if (chunk.length > 0) {
      ArrayPrototypePush(chunk, this.#scanEOL());
      ArrayPrototypePush(tokens, chunk);
    }

    // send EOF as a separate chunk
    ArrayPrototypePush(tokens, [this.#scanEOF()]);

    return tokens;
  }

  next() {
    return this.#source.next();
  }

  eof() {
    return this.#source.eof();
  }

  error(message, token, expected = '') {
    this.#source.error(message, token, expected);
  }

  #scanToken() {
    const char = this.next();

    if (this.#isEOFSymbol(char)) {
      return this.#scanEOF();
    } else if (this.#isNewLineSymbol(char)) {
      return this.#scanNewLine(char);
    } else if (this.#isNumericSymbol(char)) {
      return this.#scanNumeric(char);
    } else if (this.#isDashSymbol(char)) {
      return this.#scanDash(char);
    } else if (this.#isPlusSymbol(char)) {
      return this.#scanPlus(char);
    } else if (this.#isHashSymbol(char)) {
      return this.#scanHash(char);
    } else if (this.#isEscapeSymbol(char)) {
      return this.#scanEscapeSymbol(char);
    } else if (this.#isWhitespaceSymbol(char)) {
      return this.#scanWhitespace(char);
    } else if (this.#isLiteralSymbol(char)) {
      return this.#scanLiteral(char);
    }

    throw new ERR_TAP_LEXER_ERROR(
      `Unexpected character: ${char} at line ${this.#line}, column ${
        this.#column
      }`,
    );
  }

  #scanNewLine(char) {
    // In case of odd number of ESCAPE symbols, we need to clear the remaining
    // escape chars from the stack and start fresh for the next line.
    this.#escapeStack = [];

    // We also need to reset the comment flag
    this.#isComment = false;

    return new Token({
      kind: TokenKind.NEWLINE,
      value: char,
      stream: this.#source,
    });
  }

  #scanEOL() {
    return new Token({
      kind: TokenKind.EOL,
      value: kEOL,
      stream: this.#source,
    });
  }

  #scanEOF() {
    this.#isComment = false;

    return new Token({
      kind: TokenKind.EOF,
      value: kEOF,
      stream: this.#source,
    });
  }

  #scanEscapeSymbol(char) {
    // If the escape symbol has been escaped (by previous symbol),
    // or if the next symbol is a whitespace symbol,
    // then consume it as a literal.
    if (
      this.#hasTheCurrentCharacterBeenEscaped() ||
      this.#source.peek(1) === TokenKind.WHITESPACE
    ) {
      ArrayPrototypePop(this.#escapeStack);
      return new Token({
        kind: TokenKind.LITERAL,
        value: char,
        stream: this.#source,
      });
    }

    // Otherwise, consume the escape symbol as an escape symbol that should be ignored by the parser
    // we also need to push the escape symbol to the escape stack
    // and consume the next character as a literal (done in the next turn)
    ArrayPrototypePush(this.#escapeStack, char);
    return new Token({
      kind: TokenKind.ESCAPE,
      value: char,
      stream: this.#source,
    });
  }

  #scanWhitespace(char) {
    return new Token({
      kind: TokenKind.WHITESPACE,
      value: char,
      stream: this.#source,
    });
  }

  #scanDash(char) {
    // Peek next 3 characters and check if it's a YAML start marker
    const marker = char + this.#source.peek() + this.#source.peek(1);

    if (this.#isYamlStartSymbol(marker)) {
      this.next(); // consume second -
      this.next(); // consume third -

      return new Token({
        kind: TokenKind.TAP_YAML_START,
        value: marker,
        stream: this.#source,
      });
    }

    return new Token({
      kind: TokenKind.DASH,
      value: char,
      stream: this.#source,
    });
  }

  #scanPlus(char) {
    return new Token({
      kind: TokenKind.PLUS,
      value: char,
      stream: this.#source,
    });
  }

  #scanHash(char) {
    const lastCharacter = this.#source.peek(-2);
    const nextToken = this.#source.peek();

    // If we encounter a hash symbol at the beginning of a line,
    // we consider it as a comment
    if (!lastCharacter || this.#isNewLineSymbol(lastCharacter)) {
      this.#isComment = true;
      return new Token({
        kind: TokenKind.COMMENT,
        value: char,
        stream: this.#source,
      });
    }

    // The only valid case where a hash symbol is considered as a hash token
    // is when it's preceded by a whitespace symbol and followed by a non-hash symbol
    if (
      this.#isWhitespaceSymbol(lastCharacter) &&
      !this.#isHashSymbol(nextToken)
    ) {
      return new Token({
        kind: TokenKind.HASH,
        value: char,
        stream: this.#source,
      });
    }

    const charHasBeenEscaped = this.#hasTheCurrentCharacterBeenEscaped();
    if (this.#isComment || charHasBeenEscaped) {
      if (charHasBeenEscaped) {
        ArrayPrototypePop(this.#escapeStack);
      }

      return new Token({
        kind: TokenKind.LITERAL,
        value: char,
        stream: this.#source,
      });
    }

    // As a fallback, we consume the hash symbol as a literal
    return new Token({
      kind: TokenKind.LITERAL,
      value: char,
      stream: this.#source,
    });
  }

  #scanLiteral(char) {
    let word = char;
    while (!this.#source.eof()) {
      const nextChar = this.#source.peek();
      if (this.#isLiteralSymbol(nextChar)) {
        word += this.#source.next();
      } else {
        break;
      }
    }

    word = StringPrototypeTrim(word);

    if (TapLexer.Keywords.has(word)) {
      const token = this.#scanTAPKeyword(word);
      if (token) {
        return token;
      }
    }

    if (this.#isYamlEndSymbol(word)) {
      return new Token({
        kind: TokenKind.TAP_YAML_END,
        value: word,
        stream: this.#source,
      });
    }

    return new Token({
      kind: TokenKind.LITERAL,
      value: word,
      stream: this.#source,
    });
  }

  #scanTAPKeyword(word) {
    const isLastScannedTokenEOLorNewLine =
      TokenKind.EOL === this.#lastScannedToken.kind ||
      TokenKind.NEWLINE === this.#lastScannedToken.kind;

    if (word === 'TAP' && isLastScannedTokenEOLorNewLine) {
      return new Token({
        kind: TokenKind.TAP,
        value: word,
        stream: this.#source,
      });
    }

    if (word === 'version' && this.#lastScannedToken.kind === TokenKind.TAP) {
      return new Token({
        kind: TokenKind.TAP_VERSION,
        value: word,
        stream: this.#source,
      });
    }

    if (word === '..' && this.#lastScannedToken.kind === TokenKind.NUMERIC) {
      return new Token({
        kind: TokenKind.TAP_PLAN,
        value: word,
        stream: this.#source,
      });
    }

    if (word === 'not' && isLastScannedTokenEOLorNewLine) {
      return new Token({
        kind: TokenKind.TAP_TEST_NOTOK,
        value: word,
        stream: this.#source,
      });
    }

    if (
      word === 'ok' &&
      (this.#lastScannedToken.kind === TokenKind.TAP_TEST_NOTOK ||
        isLastScannedTokenEOLorNewLine)
    ) {
      return new Token({
        kind: TokenKind.TAP_TEST_OK,
        value: word,
        stream: this.#source,
      });
    }

    if (word === 'pragma' && isLastScannedTokenEOLorNewLine) {
      return new Token({
        kind: TokenKind.TAP_PRAGMA,
        value: word,
        stream: this.#source,
      });
    }

    return null;
  }

  #scanNumeric(char) {
    let number = char;
    while (!this.#source.eof()) {
      const nextChar = this.#source.peek();
      if (this.#isNumericSymbol(nextChar)) {
        number += nextChar;
        this.#source.next();
      } else {
        break;
      }
    }
    return new Token({
      kind: TokenKind.NUMERIC,
      value: number,
      stream: this.#source,
    });
  }

  #hasTheCurrentCharacterBeenEscaped() {
    // Use the escapeStack to keep track of the escape characters
    return this.#escapeStack.length > 0;
  }

  #isNumericSymbol(char) {
    return char >= '0' && char <= '9';
  }

  #isLiteralSymbol(char) {
    if (typeof char !== 'string') return false;
    const charCode = StringPrototypeCodePointAt(char);

    if (isZeroWidthCodePoint(charCode)) return false;
    if (this.#isWhitespaceSymbol(char)) return false;
    const MAX_ASCII_CHAR_CODE = 0b111_1111; // ASCII is 7-bit long
    // Allow all non-latin characters.
    if (charCode > MAX_ASCII_CHAR_CODE) return true;
    const ZERO = 48; // 0
    const NINE = 58; // 9
    // Disallow numeric values
    if (charCode >= ZERO && char <= NINE) return false;

    // Disallow characters with special meaning in TAP
    const HASH = 35; // #
    const BACKSLASH = 92; // \
    const PLUS = 43; // +
    const DASH = 45; // -

    // Disallow characters with special meaning in TAP
    return charCode !== HASH && charCode !== BACKSLASH &&
           charCode !== PLUS && charCode !== DASH;
  }

  #isWhitespaceSymbol(char) {
    return char === ' ' || char === '\t';
  }

  #isEOFSymbol(char) {
    return char === undefined;
  }

  #isNewLineSymbol(char) {
    return char === '\n' || char === '\r';
  }

  #isHashSymbol(char) {
    return char === '#';
  }

  #isDashSymbol(char) {
    return char === '-';
  }

  #isPlusSymbol(char) {
    return char === '+';
  }

  #isEscapeSymbol(char) {
    return char === '\\';
  }

  #isYamlStartSymbol(char) {
    return char === '---';
  }

  #isYamlEndSymbol(char) {
    return char === '...';
  }
}

module.exports = { TapLexer, TokenKind };
