/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as i18next from "i18next";
import { i18n } from "i18next";
import * as i18nextXHRBackend from "i18next-xhr-backend";
import * as i18nextBrowserLanguageDetector from "i18next-browser-languagedetector";
import { IModelError } from "@bentley/imodeljs-common";
import { Logger } from "@bentley/bentleyjs-core";
import { IModelApp } from "./IModelApp";

export interface I18NOptions {
  urlTemplate?: string;
}

export class I18N {
  private i18n: i18n;
  private namespaceRegistry: Map<string, I18NNamespace> = new Map<string, I18NNamespace>();

  public constructor(nameSpaces: string[], defaultNameSpace: string, options?: I18NOptions, renderFunction?: any) {
    this.i18n = i18next.createInstance();

    const initOptions: i18next.InitOptions = {
      interpolation: { escapeValue: true },
      fallbackLng: "en",
      ns: nameSpaces,
      defaultNS: defaultNameSpace,
      backend: {
        loadPath: options && options.urlTemplate ? options.urlTemplate : "locales/{{lng}}/{{ns}}.json",
        crossDomain: true,
      },
    };

    // if in a development environment, set to pseudo-localize, otherwise detect from browser.
    const isDevelopment: boolean = process.env.NODE_ENV === "development";
    if (isDevelopment) {
      initOptions.debug = true;
    } else {
      this.i18n = this.i18n.use(i18nextBrowserLanguageDetector);
    }

    // call the changeLanguage method right away, before any calls to I18NNamespace.register. Otherwise, the call doesn't happen until the deferred load of the default namespace
    this.i18n.use(i18nextXHRBackend)
      .init(initOptions, renderFunction)
      .changeLanguage(isDevelopment ? "en-pseudo" : undefined as any, undefined);
  }

  public translate(key: string | string[], options?: i18next.TranslationOptions): any { return this.i18n.t(key, options); }
  public loadNamespace(name: string, i18nCallback: any) { this.i18n.loadNamespaces(name, i18nCallback); }
  public languageList(): string[] { return this.i18n.languages; }

  // register a new Namespace. Must be unique in the system.
  public registerNamespace(name: string): I18NNamespace {
    if (this.namespaceRegistry.get(name))
      throw new IModelError(-1, "namespace '" + name + "' is not unique");

    const theReadPromise = new Promise<void>((resolve: any, _reject: any) => {
      IModelApp.i18n.loadNamespace(name, (err: any, _t: any) => {
        if (!err) {
          resolve();
          return;
        }
        // Here we got a non-null err object.
        // This method is called when the system has attempted to load the resources for the namespace for each
        // possible locale. For example 'fr-ca' might be the most specific local, in which case 'fr' ) and 'en are fallback locales.
        // using i18next-xhr-backend, err will be an array of strings that includes the namespace it tried to read and the locale. There
        // might be errs for some other namespaces as well as this one. We resolve the promise unless there's an error for each possible language.
        const errorList = err as string[];
        let locales: string[] = IModelApp.i18n.languageList().map((thisLocale) => "/" + thisLocale + "/");
        for (const thisError of errorList) {
          if (!thisError.includes(name))
            continue;
          locales = locales.filter((thisLocale) => !thisError.includes(thisLocale));
        }
        // if we removed every locale from the array, it wasn't loaded.
        if (locales.length === 0)
          Logger.logError("I81N", "The resource for namespace " + name + " could not be loaded");

        resolve();
      });
    });
    const thisNamespace = new I18NNamespace(name, theReadPromise);
    this.namespaceRegistry.set(name, thisNamespace);
    return thisNamespace;
  }

  public waitForAllRead(): Promise<void[]> {
    const namespacePromises = new Array<Promise<void>>();
    for (const thisNamespace of this.namespaceRegistry.values()) {
      namespacePromises.push(thisNamespace.readFinished);
    }
    return Promise.all(namespacePromises);
  }
}

export class I18NNamespace {
  public constructor(public name: string, public readFinished: Promise<void>) { }
}
