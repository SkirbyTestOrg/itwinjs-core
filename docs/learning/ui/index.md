# Learning iModel.js UI

This section provides explanations of the concepts you'll encounter in iModel.js UI.

## React version requirements

iModel.js UI is compatible with React 16.8 and later.

## Library Organization

The iModel.js UI library is divided into these NPM packages in the `@bentley` scope:

|Package Name|Description
|-----|-----
|ui&#8209;abstract|Abstractions for UI controls, such as toolbars, buttons and menus.
|ui&#8209;core|General purpose React components, such as Dialog, MessageBox, SearchBox, RadialMenu and SplitButton.
|ui&#8209;components|React components that are data-oriented, such as PropertyGrid, Table, Tree and Breadcrumb.
|[ui&#8209;ninezone](./ninezone/index)|React components for application user interface layouts following the Bentley 9&#8209;Zone pattern.
|[ui&#8209;framework](./framework/index)|Application fragments for Login, Project, iModel and View selection, and configuration of the application UI including the Backstage, Frontstages, Zones, Widgets, etc.

See also:

* [Glossary of terms used in iModel.js UI](./UIGlossary)
* [Frequently Asked Questions](./faq)
* [React](https://reactjs.org/)
* [Redux](https://redux.js.org/)
