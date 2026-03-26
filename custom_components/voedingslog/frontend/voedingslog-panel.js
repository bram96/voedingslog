var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i5 = decorators.length - 1, decorator; i5 >= 0; i5--)
    if (decorator = decorators[i5])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t4, e5, o6) {
    if (this._$cssResult$ = true, o6 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t4, this.t = e5;
  }
  get styleSheet() {
    let t4 = this.o;
    const s4 = this.t;
    if (e && void 0 === t4) {
      const e5 = void 0 !== s4 && 1 === s4.length;
      e5 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e5 && o.set(s4, t4));
    }
    return t4;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
var i = (t4, ...e5) => {
  const o6 = 1 === t4.length ? t4[0] : e5.reduce((e6, s4, o7) => e6 + ((t5) => {
    if (true === t5._$cssResult$) return t5.cssText;
    if ("number" == typeof t5) return t5;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t4[o7 + 1], t4[0]);
  return new n(o6, t4, s);
};
var S = (s4, o6) => {
  if (e) s4.adoptedStyleSheets = o6.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
  else for (const e5 of o6) {
    const o7 = document.createElement("style"), n5 = t.litNonce;
    void 0 !== n5 && o7.setAttribute("nonce", n5), o7.textContent = e5.cssText, s4.appendChild(o7);
  }
};
var c = e ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
  let e5 = "";
  for (const s4 of t5.cssRules) e5 += s4.cssText;
  return r(e5);
})(t4) : t4;

// node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t4, s4) => t4;
var u = { toAttribute(t4, s4) {
  switch (s4) {
    case Boolean:
      t4 = t4 ? l : null;
      break;
    case Object:
    case Array:
      t4 = null == t4 ? t4 : JSON.stringify(t4);
  }
  return t4;
}, fromAttribute(t4, s4) {
  let i5 = t4;
  switch (s4) {
    case Boolean:
      i5 = null !== t4;
      break;
    case Number:
      i5 = null === t4 ? null : Number(t4);
      break;
    case Object:
    case Array:
      try {
        i5 = JSON.parse(t4);
      } catch (t5) {
        i5 = null;
      }
  }
  return i5;
} };
var f = (t4, s4) => !i2(t4, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ??= Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
  static addInitializer(t4) {
    this._$Ei(), (this.l ??= []).push(t4);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t4, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t4) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t4, s4), !s4.noAccessor) {
      const i5 = Symbol(), h3 = this.getPropertyDescriptor(t4, i5, s4);
      void 0 !== h3 && e2(this.prototype, t4, h3);
    }
  }
  static getPropertyDescriptor(t4, s4, i5) {
    const { get: e5, set: r6 } = h(this.prototype, t4) ?? { get() {
      return this[s4];
    }, set(t5) {
      this[s4] = t5;
    } };
    return { get: e5, set(s5) {
      const h3 = e5?.call(this);
      r6?.call(this, s5), this.requestUpdate(t4, h3, i5);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t4) {
    return this.elementProperties.get(t4) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t4 = n2(this);
    t4.finalize(), void 0 !== t4.l && (this.l = [...t4.l]), this.elementProperties = new Map(t4.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t5 = this.properties, s4 = [...r2(t5), ...o2(t5)];
      for (const i5 of s4) this.createProperty(i5, t5[i5]);
    }
    const t4 = this[Symbol.metadata];
    if (null !== t4) {
      const s4 = litPropertyMetadata.get(t4);
      if (void 0 !== s4) for (const [t5, i5] of s4) this.elementProperties.set(t5, i5);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t5, s4] of this.elementProperties) {
      const i5 = this._$Eu(t5, s4);
      void 0 !== i5 && this._$Eh.set(i5, t5);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i5 = [];
    if (Array.isArray(s4)) {
      const e5 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e5) i5.unshift(c(s5));
    } else void 0 !== s4 && i5.push(c(s4));
    return i5;
  }
  static _$Eu(t4, s4) {
    const i5 = s4.attribute;
    return false === i5 ? void 0 : "string" == typeof i5 ? i5 : "string" == typeof t4 ? t4.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t4) => this.enableUpdating = t4), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t4) => t4(this));
  }
  addController(t4) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
  }
  removeController(t4) {
    this._$EO?.delete(t4);
  }
  _$E_() {
    const t4 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i5 of s4.keys()) this.hasOwnProperty(i5) && (t4.set(i5, this[i5]), delete this[i5]);
    t4.size > 0 && (this._$Ep = t4);
  }
  createRenderRoot() {
    const t4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t4, this.constructor.elementStyles), t4;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
  }
  enableUpdating(t4) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t4) => t4.hostDisconnected?.());
  }
  attributeChangedCallback(t4, s4, i5) {
    this._$AK(t4, i5);
  }
  _$ET(t4, s4) {
    const i5 = this.constructor.elementProperties.get(t4), e5 = this.constructor._$Eu(t4, i5);
    if (void 0 !== e5 && true === i5.reflect) {
      const h3 = (void 0 !== i5.converter?.toAttribute ? i5.converter : u).toAttribute(s4, i5.type);
      this._$Em = t4, null == h3 ? this.removeAttribute(e5) : this.setAttribute(e5, h3), this._$Em = null;
    }
  }
  _$AK(t4, s4) {
    const i5 = this.constructor, e5 = i5._$Eh.get(t4);
    if (void 0 !== e5 && this._$Em !== e5) {
      const t5 = i5.getPropertyOptions(e5), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : u;
      this._$Em = e5;
      const r6 = h3.fromAttribute(s4, t5.type);
      this[e5] = r6 ?? this._$Ej?.get(e5) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t4, s4, i5, e5 = false, h3) {
    if (void 0 !== t4) {
      const r6 = this.constructor;
      if (false === e5 && (h3 = this[t4]), i5 ??= r6.getPropertyOptions(t4), !((i5.hasChanged ?? f)(h3, s4) || i5.useDefault && i5.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r6._$Eu(t4, i5)))) return;
      this.C(t4, s4, i5);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t4, s4, { useDefault: i5, reflect: e5, wrapped: h3 }, r6) {
    i5 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t4) && (this._$Ej.set(t4, r6 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r6) || (this._$AL.has(t4) || (this.hasUpdated || i5 || (s4 = void 0), this._$AL.set(t4, s4)), true === e5 && this._$Em !== t4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t4));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t5) {
      Promise.reject(t5);
    }
    const t4 = this.scheduleUpdate();
    return null != t4 && await t4, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t6, s5] of this._$Ep) this[t6] = s5;
        this._$Ep = void 0;
      }
      const t5 = this.constructor.elementProperties;
      if (t5.size > 0) for (const [s5, i5] of t5) {
        const { wrapped: t6 } = i5, e5 = this[s5];
        true !== t6 || this._$AL.has(s5) || void 0 === e5 || this.C(s5, void 0, i5, e5);
      }
    }
    let t4 = false;
    const s4 = this._$AL;
    try {
      t4 = this.shouldUpdate(s4), t4 ? (this.willUpdate(s4), this._$EO?.forEach((t5) => t5.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t4 = false, this._$EM(), s5;
    }
    t4 && this._$AE(s4);
  }
  willUpdate(t4) {
  }
  _$AE(t4) {
    this._$EO?.forEach((t5) => t5.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t4)), this.updated(t4);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t4) {
    return true;
  }
  update(t4) {
    this._$Eq &&= this._$Eq.forEach((t5) => this._$ET(t5, this[t5])), this._$EM();
  }
  updated(t4) {
  }
  firstUpdated(t4) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/.pnpm/lit-html@3.3.2/node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t4) => t4;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
var u2 = Array.isArray;
var d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t4) => (i5, ...s4) => ({ _$litType$: t4, strings: i5, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = Symbol.for("lit-noChange");
var A = Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t4, i5) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i5) : i5;
}
var N = (t4, i5) => {
  const s4 = t4.length - 1, e5 = [];
  let n5, l3 = 2 === i5 ? "<svg>" : 3 === i5 ? "<math>" : "", c4 = v;
  for (let i6 = 0; i6 < s4; i6++) {
    const s5 = t4[i6];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n5 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n5 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n5 = void 0);
    const x2 = c4 === p2 && t4[i6 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e5.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i6 : x2);
  }
  return [V(t4, l3 + (t4[s4] || "<?>") + (2 === i5 ? "</svg>" : 3 === i5 ? "</math>" : "")), e5];
};
var S2 = class _S {
  constructor({ strings: t4, _$litType$: i5 }, e5) {
    let r6;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i5);
    if (this.el = _S.createElement(f3, e5), P.currentNode = this.el.content, 2 === i5 || 3 === i5) {
      const t5 = this.el.content.firstChild;
      t5.replaceWith(...t5.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t5 of r6.getAttributeNames()) if (t5.endsWith(h2)) {
          const i6 = v2[a3++], s4 = r6.getAttribute(t5).split(o3), e6 = /([.?@])?(.*)/.exec(i6);
          d3.push({ type: 1, index: l3, name: e6[2], strings: s4, ctor: "." === e6[1] ? I : "?" === e6[1] ? L : "@" === e6[1] ? z : H }), r6.removeAttribute(t5);
        } else t5.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r6.removeAttribute(t5));
        if (y2.test(r6.tagName)) {
          const t5 = r6.textContent.split(o3), i6 = t5.length - 1;
          if (i6 > 0) {
            r6.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i6; s4++) r6.append(t5[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r6.append(t5[i6], c3());
          }
        }
      } else if (8 === r6.nodeType) if (r6.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t5 = -1;
        for (; -1 !== (t5 = r6.data.indexOf(o3, t5 + 1)); ) d3.push({ type: 7, index: l3 }), t5 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t4, i5) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t4, s4;
  }
};
function M(t4, i5, s4 = t4, e5) {
  if (i5 === E) return i5;
  let h3 = void 0 !== e5 ? s4._$Co?.[e5] : s4._$Cl;
  const o6 = a2(i5) ? void 0 : i5._$litDirective$;
  return h3?.constructor !== o6 && (h3?._$AO?.(false), void 0 === o6 ? h3 = void 0 : (h3 = new o6(t4), h3._$AT(t4, s4, e5)), void 0 !== e5 ? (s4._$Co ??= [])[e5] = h3 : s4._$Cl = h3), void 0 !== h3 && (i5 = M(t4, h3._$AS(t4, i5.values), h3, e5)), i5;
}
var R = class {
  constructor(t4, i5) {
    this._$AV = [], this._$AN = void 0, this._$AD = t4, this._$AM = i5;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t4) {
    const { el: { content: i5 }, parts: s4 } = this._$AD, e5 = (t4?.creationScope ?? l2).importNode(i5, true);
    P.currentNode = e5;
    let h3 = P.nextNode(), o6 = 0, n5 = 0, r6 = s4[0];
    for (; void 0 !== r6; ) {
      if (o6 === r6.index) {
        let i6;
        2 === r6.type ? i6 = new k(h3, h3.nextSibling, this, t4) : 1 === r6.type ? i6 = new r6.ctor(h3, r6.name, r6.strings, this, t4) : 6 === r6.type && (i6 = new Z(h3, this, t4)), this._$AV.push(i6), r6 = s4[++n5];
      }
      o6 !== r6?.index && (h3 = P.nextNode(), o6++);
    }
    return P.currentNode = l2, e5;
  }
  p(t4) {
    let i5 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i5), i5 += s4.strings.length - 2) : s4._$AI(t4[i5])), i5++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t4, i5, s4, e5) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i5, this._$AM = s4, this.options = e5, this._$Cv = e5?.isConnected ?? true;
  }
  get parentNode() {
    let t4 = this._$AA.parentNode;
    const i5 = this._$AM;
    return void 0 !== i5 && 11 === t4?.nodeType && (t4 = i5.parentNode), t4;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t4, i5 = this) {
    t4 = M(this, t4, i5), a2(t4) ? t4 === A || null == t4 || "" === t4 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t4 !== this._$AH && t4 !== E && this._(t4) : void 0 !== t4._$litType$ ? this.$(t4) : void 0 !== t4.nodeType ? this.T(t4) : d2(t4) ? this.k(t4) : this._(t4);
  }
  O(t4) {
    return this._$AA.parentNode.insertBefore(t4, this._$AB);
  }
  T(t4) {
    this._$AH !== t4 && (this._$AR(), this._$AH = this.O(t4));
  }
  _(t4) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t4 : this.T(l2.createTextNode(t4)), this._$AH = t4;
  }
  $(t4) {
    const { values: i5, _$litType$: s4 } = t4, e5 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e5) this._$AH.p(i5);
    else {
      const t5 = new R(e5, this), s5 = t5.u(this.options);
      t5.p(i5), this.T(s5), this._$AH = t5;
    }
  }
  _$AC(t4) {
    let i5 = C.get(t4.strings);
    return void 0 === i5 && C.set(t4.strings, i5 = new S2(t4)), i5;
  }
  k(t4) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i5 = this._$AH;
    let s4, e5 = 0;
    for (const h3 of t4) e5 === i5.length ? i5.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i5[e5], s4._$AI(h3), e5++;
    e5 < i5.length && (this._$AR(s4 && s4._$AB.nextSibling, e5), i5.length = e5);
  }
  _$AR(t4 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t4 !== this._$AB; ) {
      const s5 = i3(t4).nextSibling;
      i3(t4).remove(), t4 = s5;
    }
  }
  setConnected(t4) {
    void 0 === this._$AM && (this._$Cv = t4, this._$AP?.(t4));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t4, i5, s4, e5, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i5, this._$AM = e5, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t4, i5 = this, s4, e5) {
    const h3 = this.strings;
    let o6 = false;
    if (void 0 === h3) t4 = M(this, t4, i5, 0), o6 = !a2(t4) || t4 !== this._$AH && t4 !== E, o6 && (this._$AH = t4);
    else {
      const e6 = t4;
      let n5, r6;
      for (t4 = h3[0], n5 = 0; n5 < h3.length - 1; n5++) r6 = M(this, e6[s4 + n5], i5, n5), r6 === E && (r6 = this._$AH[n5]), o6 ||= !a2(r6) || r6 !== this._$AH[n5], r6 === A ? t4 = A : t4 !== A && (t4 += (r6 ?? "") + h3[n5 + 1]), this._$AH[n5] = r6;
    }
    o6 && !e5 && this.j(t4);
  }
  j(t4) {
    t4 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t4 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t4) {
    this.element[this.name] = t4 === A ? void 0 : t4;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t4) {
    this.element.toggleAttribute(this.name, !!t4 && t4 !== A);
  }
};
var z = class extends H {
  constructor(t4, i5, s4, e5, h3) {
    super(t4, i5, s4, e5, h3), this.type = 5;
  }
  _$AI(t4, i5 = this) {
    if ((t4 = M(this, t4, i5, 0) ?? A) === E) return;
    const s4 = this._$AH, e5 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e5);
    e5 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
  }
  handleEvent(t4) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
  }
};
var Z = class {
  constructor(t4, i5, s4) {
    this.element = t4, this.type = 6, this._$AN = void 0, this._$AM = i5, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t4) {
    M(this, t4);
  }
};
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.2");
var D = (t4, i5, s4) => {
  const e5 = s4?.renderBefore ?? i5;
  let h3 = e5._$litPart$;
  if (void 0 === h3) {
    const t5 = s4?.renderBefore ?? null;
    e5._$litPart$ = h3 = new k(i5.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
  }
  return h3._$AI(t4), h3;
};

// node_modules/.pnpm/lit-element@4.2.2/node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t4 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t4.firstChild, t4;
  }
  update(t4) {
    const r6 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t4), this._$Do = D(r6, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ??= []).push("4.2.2");

// node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/decorators/custom-element.js
var t3 = (t4) => (e5, o6) => {
  void 0 !== o6 ? o6.addInitializer(() => {
    customElements.define(t4, e5);
  }) : customElements.define(t4, e5);
};

// node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/decorators/property.js
var o5 = { attribute: true, type: String, converter: u, reflect: false, hasChanged: f };
var r4 = (t4 = o5, e5, r6) => {
  const { kind: n5, metadata: i5 } = r6;
  let s4 = globalThis.litPropertyMetadata.get(i5);
  if (void 0 === s4 && globalThis.litPropertyMetadata.set(i5, s4 = /* @__PURE__ */ new Map()), "setter" === n5 && ((t4 = Object.create(t4)).wrapped = true), s4.set(r6.name, t4), "accessor" === n5) {
    const { name: o6 } = r6;
    return { set(r7) {
      const n6 = e5.get.call(this);
      e5.set.call(this, r7), this.requestUpdate(o6, n6, t4, true, r7);
    }, init(e6) {
      return void 0 !== e6 && this.C(o6, void 0, t4, e6), e6;
    } };
  }
  if ("setter" === n5) {
    const { name: o6 } = r6;
    return function(r7) {
      const n6 = this[o6];
      e5.call(this, r7), this.requestUpdate(o6, n6, t4, true, r7);
    };
  }
  throw Error("Unsupported decorator location: " + n5);
};
function n4(t4) {
  return (e5, o6) => "object" == typeof o6 ? r4(t4, e5, o6) : ((t5, e6, o7) => {
    const r6 = e6.hasOwnProperty(o7);
    return e6.constructor.createProperty(o7, t5), r6 ? Object.getOwnPropertyDescriptor(e6, o7) : void 0;
  })(t4, e5, o6);
}

// node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/decorators/state.js
function r5(r6) {
  return n4({ ...r6, state: true, attribute: false });
}

// src/helpers.ts
var CATEGORY_ICONS = {
  breakfast: "mdi:coffee",
  lunch: "mdi:food",
  dinner: "mdi:silverware-fork-knife",
  snack: "mdi:cookie"
};
var DEFAULT_CATEGORY_LABELS = {
  breakfast: "Ontbijt",
  lunch: "Lunch",
  dinner: "Avondeten",
  snack: "Tussendoor"
};
var KEY_NUTRIENTS_DISPLAY = [
  { key: "energy-kcal_100g", label: "Kcal", unit: "kcal", decimals: 0 },
  { key: "proteins_100g", label: "Eiwit", unit: "g", decimals: 1 },
  { key: "carbohydrates_100g", label: "Koolh.", unit: "g", decimals: 1 },
  { key: "fat_100g", label: "Vet", unit: "g", decimals: 1 }
];
function defaultCategory() {
  const h3 = (/* @__PURE__ */ new Date()).getHours();
  if (h3 < 10) return "breakfast";
  if (h3 < 14) return "lunch";
  if (h3 < 17) return "snack";
  return "dinner";
}
function groupByCategory(items) {
  const groups = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: []
  };
  items.forEach((item, index) => {
    const cat = item.category || "snack";
    if (groups[cat]) {
      groups[cat].push({ ...item, _index: index });
    }
  });
  return groups;
}
function calcItemNutrients(item) {
  const factor = (item.grams || 0) / 100;
  const result = {};
  for (const n5 of KEY_NUTRIENTS_DISPLAY) {
    result[n5.key] = (item.nutrients?.[n5.key] || 0) * factor;
  }
  return result;
}
function sumNutrients(items) {
  const totals = {};
  for (const n5 of KEY_NUTRIENTS_DISPLAY) totals[n5.key] = 0;
  for (const item of items) {
    const vals = calcItemNutrients(item);
    for (const k2 in vals) totals[k2] += vals[k2];
  }
  return totals;
}

// src/voedingslog-panel.ts
var VoedingslogPanel = class extends i4 {
  constructor() {
    super(...arguments);
    this.narrow = false;
    this._config = null;
    this._selectedPerson = null;
    this._selectedDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    this._items = [];
    this._loading = true;
    this._dialogMode = null;
    this._pendingProduct = null;
    this._searchResults = [];
    this._searchQuery = "";
    this._scanning = false;
    this._analyzing = false;
    this._stream = null;
    this._barcodeDetector = null;
    this._scanAnimFrame = null;
  }
  // ── Lifecycle ────────────────────────────────────────────────────
  async connectedCallback() {
    super.connectedCallback();
    await this._loadConfig();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopCamera();
  }
  async _loadConfig() {
    try {
      this._config = await this.hass.callWS({
        type: "voedingslog/get_config"
      });
      if (this._config?.persons?.length && !this._selectedPerson) {
        this._selectedPerson = this._config.persons[0];
      }
      await this._loadLog();
    } catch (e5) {
      console.error("Failed to load voedingslog config:", e5);
      this._loading = false;
    }
  }
  async _loadLog() {
    if (!this._selectedPerson) return;
    this._loading = true;
    try {
      const res = await this.hass.callWS({
        type: "voedingslog/get_log",
        person: this._selectedPerson,
        date: this._selectedDate
      });
      this._items = res.items || [];
    } catch (e5) {
      console.error("Failed to load log:", e5);
    }
    this._loading = false;
  }
  // ── Rendering ────────────────────────────────────────────────────
  render() {
    if (!this._config || this._loading) {
      return b2`<div class="container"><p>Laden...</p></div>`;
    }
    const labels = this._config.category_labels || DEFAULT_CATEGORY_LABELS;
    const groups = groupByCategory(this._items);
    return b2`
      <div class="panel">
        ${this._renderHeader()}
        <div class="container">
          ${this._renderActions()}
          ${this._renderDayTotals()}
          ${["breakfast", "lunch", "dinner", "snack"].map(
      (cat) => this._renderCategorySection(cat, labels[cat], groups[cat])
    )}
        </div>
      </div>
      ${this._renderDialog()}
    `;
  }
  _renderHeader() {
    const persons = this._config?.persons || [];
    return b2`
      <div class="header">
        <div class="header-top">
          <h1>Voedingslog</h1>
          <input
            type="date"
            .value=${this._selectedDate}
            @change=${(e5) => {
      this._selectedDate = e5.target.value;
      this._loadLog();
    }}
          />
        </div>
        ${persons.length > 1 ? b2`<div class="person-tabs">
              ${persons.map(
      (p3) => b2`
                  <button
                    class="person-tab ${p3 === this._selectedPerson ? "active" : ""}"
                    @click=${() => {
        this._selectedPerson = p3;
        this._loadLog();
      }}
                  >
                    ${p3}
                  </button>
                `
    )}
            </div>` : A}
      </div>
    `;
  }
  _renderActions() {
    const hasAI = !!this._config?.ai_task_entity;
    return b2`
      <div class="actions">
        <button class="action-btn" @click=${() => this._openBarcodeScanner()}>
          <ha-icon icon="mdi:barcode-scan"></ha-icon>
          <span>Scan barcode</span>
        </button>
        <button class="action-btn" @click=${() => this._openSearch()}>
          <ha-icon icon="mdi:magnify"></ha-icon>
          <span>Zoek product</span>
        </button>
        <button class="action-btn" @click=${() => this._openPhotoCapture()} ?disabled=${!hasAI}>
          <ha-icon icon="mdi:camera"></ha-icon>
          <span>Foto etiket</span>
        </button>
      </div>
    `;
  }
  _renderDayTotals() {
    const totals = sumNutrients(this._items);
    const goal = this._config?.calories_goal || 2e3;
    const kcal = totals["energy-kcal_100g"] || 0;
    const pct = Math.min(100, Math.round(kcal / goal * 100));
    return b2`
      <div class="day-totals card">
        <div class="totals-header">
          <span class="totals-title">Dagtotaal</span>
          <span class="totals-cal">${Math.round(kcal)} / ${goal} kcal</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: ${pct}%; background: ${pct > 100 ? "var(--error-color, #db4437)" : "var(--primary-color)"}"
          ></div>
        </div>
        <div class="macro-row">
          ${KEY_NUTRIENTS_DISPLAY.filter((n5) => n5.key !== "energy-kcal_100g").map(
      (n5) => b2`
              <div class="macro-item">
                <span class="macro-value">${(totals[n5.key] || 0).toFixed(n5.decimals)}${n5.unit}</span>
                <span class="macro-label">${n5.label}</span>
              </div>
            `
    )}
        </div>
      </div>
    `;
  }
  _renderCategorySection(category, label, items) {
    const catTotals = sumNutrients(items);
    return b2`
      <div class="category-section card">
        <div class="category-header">
          <ha-icon icon=${CATEGORY_ICONS[category] || "mdi:food"}></ha-icon>
          <span class="category-title">${label}</span>
          <span class="category-cal">${Math.round(catTotals["energy-kcal_100g"] || 0)} kcal</span>
        </div>
        ${items.length === 0 ? b2`<div class="empty-hint">Nog geen items</div>` : items.map((item) => this._renderItem(item))}
      </div>
    `;
  }
  _renderItem(item) {
    const vals = calcItemNutrients(item);
    return b2`
      <div class="food-item">
        <div class="item-main">
          <span class="item-name">${item.name}</span>
          <span class="item-meta">${item.grams}g · ${item.time}</span>
        </div>
        <div class="item-nutrients">
          <span class="item-kcal">${Math.round(vals["energy-kcal_100g"] || 0)} kcal</span>
        </div>
        <button class="item-delete" @click=${() => this._deleteItem(item._index)}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
    `;
  }
  // ── Dialogs ──────────────────────────────────────────────────────
  _renderDialog() {
    if (!this._dialogMode) return A;
    return b2`
      <div class="dialog-overlay" @click=${() => this._closeDialog()}>
        <div class="dialog" @click=${(e5) => e5.stopPropagation()}>
          ${this._dialogMode === "barcode" ? this._renderBarcodeDialog() : A}
          ${this._dialogMode === "search" ? this._renderSearchDialog() : A}
          ${this._dialogMode === "photo" ? this._renderPhotoDialog() : A}
          ${this._dialogMode === "weight" ? this._renderWeightDialog() : A}
        </div>
      </div>
    `;
  }
  _renderBarcodeDialog() {
    return b2`
      <div class="dialog-header">
        <h2>Scan barcode</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <video id="barcode-video" autoplay playsinline></video>
        ${this._scanning ? b2`<div class="scan-overlay"><div class="scan-line"></div></div>` : A}
        <div class="manual-barcode">
          <span>Of voer handmatig in:</span>
          <div class="input-row">
            <input
              type="text"
              id="manual-barcode"
              placeholder="Barcode nummer"
              inputmode="numeric"
              @keydown=${(e5) => {
      if (e5.key === "Enter") this._lookupManualBarcode();
    }}
            />
            <button class="btn-primary" @click=${() => this._lookupManualBarcode()}>Zoek</button>
          </div>
        </div>
      </div>
    `;
  }
  _renderSearchDialog() {
    return b2`
      <div class="dialog-header">
        <h2>Zoek product</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="input-row">
          <input
            type="text"
            id="search-input"
            placeholder="Productnaam..."
            .value=${this._searchQuery}
            @input=${(e5) => {
      this._searchQuery = e5.target.value;
    }}
            @keydown=${(e5) => {
      if (e5.key === "Enter") this._doSearch();
    }}
          />
          <button class="btn-primary" @click=${() => this._doSearch()}>Zoek</button>
        </div>
        <div class="search-results">
          ${this._searchResults.map(
      (p3) => b2`
              <div class="search-result" @click=${() => this._selectProduct(p3)}>
                <span class="result-name">${p3.name}</span>
                <span class="result-meta">${Math.round(p3.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
              </div>
            `
    )}
        </div>
      </div>
    `;
  }
  _renderPhotoDialog() {
    return b2`
      <div class="dialog-header">
        <h2>Foto van etiket</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${this._analyzing ? b2`<div class="analyzing">
              <ha-circular-progress indeterminate></ha-circular-progress>
              <p>Analyseren...</p>
            </div>` : b2`
              <p class="photo-hint">Maak een foto van het voedingsetiket op de verpakking.</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                id="photo-input"
                @change=${(e5) => this._handlePhotoCapture(e5)}
                style="display:none"
              />
              <button
                class="btn-primary photo-btn"
                @click=${() => this.shadowRoot?.getElementById("photo-input")?.click()}
              >
                <ha-icon icon="mdi:camera"></ha-icon>
                Maak foto
              </button>
            `}
      </div>
    `;
  }
  _renderWeightDialog() {
    if (!this._pendingProduct) return A;
    const p3 = this._pendingProduct;
    return b2`
      <div class="dialog-header">
        <h2>${p3.name}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="nutrient-preview">
          <div class="preview-title">Voedingswaarden per 100g</div>
          <div class="nutrient-grid">
            ${KEY_NUTRIENTS_DISPLAY.map(
      (n5) => b2`
                <div class="nutrient-row">
                  <span>${n5.label}</span>
                  <span>${(p3.nutrients?.[n5.key] || 0).toFixed(n5.decimals)} ${n5.unit}</span>
                </div>
              `
    )}
          </div>
        </div>

        <div class="weight-section">
          <label>Gewicht (gram)</label>
          <input
            type="number"
            id="weight-input"
            .value=${String(p3.serving_grams || 100)}
            min="1"
            step="1"
            inputmode="numeric"
            @input=${() => this.requestUpdate()}
          />
        </div>

        <div class="category-section-dialog">
          <label>Maaltijd</label>
          <select id="category-select">
            ${["breakfast", "lunch", "dinner", "snack"].map(
      (cat) => b2`
                <option value=${cat} ?selected=${cat === defaultCategory()}>
                  ${(this._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
    )}
          </select>
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this._confirmLog()}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Toevoegen
        </button>
      </div>
    `;
  }
  // ── Actions ──────────────────────────────────────────────────────
  _openBarcodeScanner() {
    this._dialogMode = "barcode";
    this._scanning = false;
    this.updateComplete.then(() => this._startCamera());
  }
  _openSearch() {
    this._dialogMode = "search";
    this._searchResults = [];
    this._searchQuery = "";
  }
  _openPhotoCapture() {
    this._dialogMode = "photo";
    this._analyzing = false;
  }
  _closeDialog() {
    this._stopCamera();
    this._dialogMode = null;
    this._pendingProduct = null;
    this._searchResults = [];
    this._analyzing = false;
  }
  async _startCamera() {
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      const video = this.shadowRoot?.getElementById(
        "barcode-video"
      );
      if (video) {
        video.srcObject = this._stream;
        this._scanning = true;
        if (window.BarcodeDetector) {
          this._barcodeDetector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e"]
          });
          this._scanLoop(video);
        }
      }
    } catch (e5) {
      console.warn("Camera not available:", e5);
      this._scanning = false;
    }
  }
  async _scanLoop(video) {
    if (!this._scanning || !this._barcodeDetector) return;
    try {
      const barcodes = await this._barcodeDetector.detect(video);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        this._scanning = false;
        this._stopCamera();
        await this._lookupBarcode(code);
        return;
      }
    } catch {
    }
    this._scanAnimFrame = requestAnimationFrame(() => this._scanLoop(video));
  }
  _stopCamera() {
    this._scanning = false;
    if (this._scanAnimFrame) {
      cancelAnimationFrame(this._scanAnimFrame);
      this._scanAnimFrame = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t4) => t4.stop());
      this._stream = null;
    }
    this._barcodeDetector = null;
  }
  async _lookupManualBarcode() {
    const input = this.shadowRoot?.getElementById(
      "manual-barcode"
    );
    const barcode = input?.value?.trim();
    if (!barcode) return;
    await this._lookupBarcode(barcode);
  }
  async _lookupBarcode(barcode) {
    try {
      const res = await this.hass.callWS({
        type: "voedingslog/lookup_barcode",
        barcode
      });
      if (res.product) {
        this._selectProduct(res.product);
      } else {
        alert(`Barcode ${barcode} niet gevonden in Open Food Facts.`);
      }
    } catch (e5) {
      console.error("Barcode lookup failed:", e5);
      alert("Fout bij opzoeken barcode.");
    }
  }
  async _doSearch() {
    const input = this.shadowRoot?.getElementById("search-input");
    const query = (input?.value || this._searchQuery).trim();
    if (!query) return;
    try {
      const res = await this.hass.callWS({
        type: "voedingslog/search_products",
        query
      });
      this._searchResults = res.products || [];
      if (this._searchResults.length === 0) {
        this._searchResults = [];
      }
    } catch (e5) {
      console.error("Search failed:", e5);
      alert("Fout bij zoeken. Controleer de verbinding.");
    }
  }
  _selectProduct(product) {
    this._pendingProduct = product;
    this._stopCamera();
    this._dialogMode = "weight";
  }
  async _handlePhotoCapture(e5) {
    const input = e5.target;
    const file = input.files?.[0];
    if (!file) return;
    this._analyzing = true;
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await this.hass.callWS({
        type: "voedingslog/analyze_photo",
        photo_b64: b64
      });
      if (res.product) {
        this._analyzing = false;
        this._selectProduct(res.product);
      } else {
        this._analyzing = false;
        alert("Kon voedingswaarden niet herkennen. Probeer een duidelijkere foto.");
      }
    } catch (err) {
      console.error("Photo analysis failed:", err);
      this._analyzing = false;
      alert("Fout bij analyseren foto: " + (err.message || err));
    }
  }
  async _confirmLog() {
    const p3 = this._pendingProduct;
    if (!p3) return;
    const gramsInput = this.shadowRoot?.getElementById(
      "weight-input"
    );
    const catSelect = this.shadowRoot?.getElementById(
      "category-select"
    );
    const grams = parseFloat(gramsInput?.value || "") || 100;
    const category = catSelect?.value || defaultCategory();
    try {
      await this.hass.callWS({
        type: "voedingslog/log_product",
        person: this._selectedPerson,
        name: p3.name,
        grams,
        nutrients: p3.nutrients || {},
        category
      });
      this._closeDialog();
      await this._loadLog();
    } catch (e5) {
      console.error("Failed to log product:", e5);
      alert("Fout bij opslaan.");
    }
  }
  async _deleteItem(index) {
    try {
      await this.hass.callWS({
        type: "voedingslog/delete_item",
        person: this._selectedPerson,
        index,
        date: this._selectedDate
      });
      await this._loadLog();
    } catch (e5) {
      console.error("Failed to delete item:", e5);
    }
  }
};
// ── Styles ───────────────────────────────────────────────────────
VoedingslogPanel.styles = i`
    :host {
      --panel-padding: 16px;
      display: block;
      background: var(--primary-background-color);
      min-height: 100vh;
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
      color: var(--primary-text-color);
    }

    .panel {
      max-width: 600px;
      margin: 0 auto;
      padding-bottom: 24px;
    }

    /* Header */
    .header {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      padding: var(--panel-padding);
      padding-top: calc(var(--panel-padding) + env(safe-area-inset-top, 0px));
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
    .header input[type="date"] {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: inherit;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .person-tabs {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .person-tab {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: inherit;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .person-tab.active {
      background: rgba(255, 255, 255, 0.35);
      font-weight: 500;
    }

    .container {
      padding: var(--panel-padding);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Actions */
    .actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 8px;
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    .action-btn:hover {
      background: var(--secondary-background-color);
    }
    .action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .action-btn ha-icon {
      --mdc-icon-size: 24px;
    }

    /* Cards */
    .card {
      background: var(--card-background-color);
      border-radius: 12px;
      padding: 16px;
      border: 1px solid var(--divider-color);
    }

    /* Day totals */
    .totals-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .totals-title {
      font-weight: 500;
      font-size: 16px;
    }
    .totals-cal {
      font-size: 14px;
      color: var(--secondary-text-color);
    }
    .progress-bar {
      height: 8px;
      background: var(--divider-color);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .macro-row {
      display: flex;
      justify-content: space-around;
    }
    .macro-item {
      text-align: center;
    }
    .macro-value {
      display: block;
      font-size: 16px;
      font-weight: 500;
    }
    .macro-label {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    /* Category sections */
    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider-color);
    }
    .category-header ha-icon {
      --mdc-icon-size: 20px;
      color: var(--primary-color);
    }
    .category-title {
      font-weight: 500;
      flex: 1;
    }
    .category-cal {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .empty-hint {
      font-size: 13px;
      color: var(--secondary-text-color);
      font-style: italic;
      padding: 4px 0;
    }

    /* Food items */
    .food-item {
      display: flex;
      align-items: center;
      padding: 8px 0;
      gap: 8px;
      border-bottom: 1px solid var(--divider-color);
    }
    .food-item:last-child {
      border-bottom: none;
    }
    .item-main {
      flex: 1;
      min-width: 0;
    }
    .item-name {
      display: block;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-meta {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .item-kcal {
      font-size: 13px;
      white-space: nowrap;
      font-weight: 500;
    }
    .item-delete {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
    }
    .item-delete:hover {
      color: var(--error-color, #db4437);
    }
    .item-delete ha-icon {
      --mdc-icon-size: 18px;
    }

    /* Dialog overlay */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .dialog {
      background: var(--card-background-color);
      border-radius: 16px 16px 0 0;
      width: 100%;
      max-width: 600px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 0;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color);
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 4px;
      display: flex;
    }
    .dialog-body {
      padding: 16px;
    }

    /* Barcode scanner */
    #barcode-video {
      width: 100%;
      border-radius: 8px;
      background: #000;
      max-height: 250px;
      object-fit: cover;
    }
    .scan-overlay {
      position: relative;
      margin-top: -4px;
      height: 4px;
      overflow: hidden;
    }
    .scan-line {
      height: 2px;
      background: var(--primary-color);
      animation: scan 1.5s ease-in-out infinite;
    }
    @keyframes scan {
      0%,
      100% {
        transform: translateX(-100%);
      }
      50% {
        transform: translateX(100%);
      }
    }
    .manual-barcode {
      margin-top: 16px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .manual-barcode span {
      display: block;
      margin-bottom: 8px;
    }

    /* Input rows */
    .input-row {
      display: flex;
      gap: 8px;
    }
    .input-row input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      font-size: 14px;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .btn-primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: center;
    }
    .btn-primary:hover {
      opacity: 0.9;
    }

    /* Search results */
    .search-results {
      margin-top: 12px;
      max-height: 300px;
      overflow-y: auto;
    }
    .search-result {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 8px;
      border-bottom: 1px solid var(--divider-color);
      cursor: pointer;
      border-radius: 8px;
    }
    .search-result:hover {
      background: var(--secondary-background-color);
    }
    .result-name {
      font-size: 14px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }
    .result-meta {
      font-size: 12px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }

    /* Photo */
    .photo-hint {
      font-size: 14px;
      color: var(--secondary-text-color);
      margin-bottom: 16px;
    }
    .photo-btn {
      width: 100%;
      padding: 14px;
      font-size: 16px;
    }
    .analyzing {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 0;
    }

    /* Weight dialog */
    .nutrient-preview {
      background: var(--primary-background-color);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .preview-title {
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
    }
    .nutrient-grid {
      display: grid;
      gap: 4px;
    }
    .nutrient-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      padding: 2px 0;
    }
    .weight-section,
    .category-section-dialog {
      margin-bottom: 16px;
    }
    .weight-section label,
    .category-section-dialog label {
      display: block;
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 6px;
    }
    .weight-section input,
    .category-section-dialog select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      font-size: 16px;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
      box-sizing: border-box;
    }
    .btn-confirm {
      width: 100%;
      padding: 14px;
      font-size: 16px;
      margin-top: 8px;
    }
  `;
__decorateClass([
  n4({ attribute: false })
], VoedingslogPanel.prototype, "hass", 2);
__decorateClass([
  n4({ type: Boolean })
], VoedingslogPanel.prototype, "narrow", 2);
__decorateClass([
  n4({ attribute: false })
], VoedingslogPanel.prototype, "panel", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_config", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_selectedPerson", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_selectedDate", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_items", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_loading", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_dialogMode", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_pendingProduct", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_searchResults", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_searchQuery", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_scanning", 2);
__decorateClass([
  r5()
], VoedingslogPanel.prototype, "_analyzing", 2);
VoedingslogPanel = __decorateClass([
  t3("voedingslog-panel")
], VoedingslogPanel);
export {
  VoedingslogPanel
};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/lit-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-element/lit-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/custom-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/property.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/state.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/event-options.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/base.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-all.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-async.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
